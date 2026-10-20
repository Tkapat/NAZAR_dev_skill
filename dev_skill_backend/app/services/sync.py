import json
import os
from datetime import datetime, timezone

from bson import ObjectId

from app.core.config import settings
from app.db.mongo import db
from app.routers.files import save_evidence
from app.services.dbfuncs import recompute_risk
from app.services.ledger import PUBLIC_KEY_HEX, conn

STATE = {"offline": settings.force_offline}
OID_FIELDS = ("centre_id", "session_id", "camera_id", "observation_id")


def register_device():
    db.edge_devices.update_one(
        {"_id": settings.device_id},
        {
            "$set": {"public_key_hex": PUBLIC_KEY_HEX},
            "$setOnInsert": {"created_at": datetime.now(timezone.utc), "chain_ok": True},
        },
        upsert=True,
    )


def _fix(row: dict) -> dict:
    row = dict(row)
    for k in OID_FIELDS:
        if row.get(k):
            row[k] = ObjectId(row[k])
    for k in ("hour_bucket", "created_at"):
        if isinstance(row.get(k), str):
            row[k] = datetime.fromisoformat(row[k])
    return row


def unsynced_count():
    return conn().execute("SELECT COUNT(*) FROM ledger WHERE synced=0").fetchone()[0]


def sync_tick(batch=25):
    if STATE["offline"]:
        return {"skipped": "offline"}
    c = conn()
    rows = c.execute(
        """SELECT seq,kind,payload,prev_hash,hash,sig,ts FROM ledger WHERE synced=0
        ORDER BY CASE kind WHEN 'flag' THEN 0 ELSE 1 END, seq LIMIT ?""",
        (batch,),
    ).fetchall()
    done = 0
    for seq, kind, payload, prev, h, sig, ts in rows:
        p = json.loads(payload)
        try:
            ev_ids = []
            for i, local in enumerate(p.pop("evidence_local", [])):
                with open(local, "rb") as f:
                    ev_ids.append(
                        save_evidence(
                            ObjectId(p["centre_id"]),
                            f.read(),
                            f"{h[:16]}_{i}",
                            p["row"].get("session_id"),
                        )
                    )
                os.remove(local)
            db.ledger_entries.update_one(
                {"hash": h},
                {
                    "$setOnInsert": {
                        "device_id": settings.device_id,
                        "seq": seq,
                        "kind": kind,
                        "payload": p,
                        "prev_hash": prev,
                        "sig": sig,
                        "ts": datetime.fromisoformat(ts),
                    }
                },
                upsert=True,
            )
            if kind == "observation":
                db.observations.update_one(
                    {"ledger_hash": h}, {"$set": _fix(p["row"])}, upsert=True
                )
            elif kind == "flag":
                row = _fix(p["row"])
                r = db.flags.update_one(
                    {"ledger_hash": h},
                    {
                        "$setOnInsert": {
                            **row,
                            "evidence_ids": ev_ids,
                            "status": "open",
                            "ledger_hash": h,
                            "created_at": datetime.now(timezone.utc),
                            "events": [{"action": "created", "ts": datetime.now(timezone.utc)}],
                        }
                    },
                    upsert=True,
                )
                if r.upserted_id:
                    recompute_risk(row["centre_id"])
            elif kind == "snapshot":
                row = _fix(p["row"])
                try:
                    db.snapshots.insert_one(row)
                except Exception as e:
                    if "duplicate" not in str(e).lower():
                        raise
                else:
                    # Newly inserted: re-apply timeline/summary updates.
                    from zoneinfo import ZoneInfo

                    IST = ZoneInfo("Asia/Kolkata")
                    ts = row["ts"]
                    day = ts.astimezone(IST).date().isoformat()
                    people = row.get("people", 0)
                    inc = {"snapshots": 1, "people_sum": people}
                    mx = {"people_max": people}
                    for cls, v in (row.get("items") or {}).items():
                        inc[f"items.{cls}.present_sum"] = v.get("present", 0)
                        inc[f"items.{cls}.in_use_sum"] = v.get("in_use", 0)
                        mx[f"items.{cls}.present_max"] = v.get("present", 0)
                    db.daily_summaries.update_one(
                        {"centre_id": row["centre_id"], "date": day},
                        {"$inc": inc, "$max": mx, "$min": {"first_seen": ts},
                         "$set": {"last_seen": ts, "updated_at": datetime.now(timezone.utc)}},
                        upsert=True,
                    )
                    db.day_timelines.update_one(
                        {"camera_id": row["camera_id"], "date": day},
                        {"$setOnInsert": {"centre_id": row["centre_id"]},
                         "$set": {"updated_at": datetime.now(timezone.utc)},
                         "$push": {"points": {"$each": [{"ts": ts, "people": people,
                                 "items": {c: {"present": v.get("present", 0), "in_use": v.get("in_use", 0)}
                                            for c, v in (row.get("items") or {}).items()}}],
                                              "$slice": -2000}}},
                        upsert=True,
                    )
            elif kind == "snapshot_batch":
                # Just store in ledger_entries (already done above)
                pass
            c.execute("UPDATE ledger SET synced=1 WHERE seq=?", (seq,))
            c.commit()
            done += 1
        except Exception:
            break
    db.edge_devices.update_one(
        {"_id": settings.device_id}, {"$set": {"last_sync": datetime.now(timezone.utc)}}
    )
    return {"synced": done, "pending": unsynced_count()}

def sync_now(batch=100):
    return sync_tick(batch)