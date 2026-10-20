import time
import threading
import statistics
import hashlib
import json
from collections import deque
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from app.core.config import settings
from app.db.mongo import db
from app.services import ledger
from app.services.consolidate import consolidate
from app.services.files_store import save_blob
from app.services.vision.detector import Detector
from app.services.vision.quality import quality_gate
from app.services.vision.cleanup import cleanup
from app.services.vision.usage import item_usage
from app.services.vision.privacy import blurred_thumbnail
from app.services.monitor import ensure_run, touch_run, end_run, session_timing

IST = ZoneInfo("Asia/Kolkata")
_sem = threading.Semaphore(2)
_det = {}
_st = {}

def _detector(tpl, tiling):
    backend = tpl.get("detector_backend", "auto")
    k = (tuple(tpl["detector_classes"]), bool(tiling), backend)
    if k not in _det:
        _det[k] = Detector(tpl["detector_classes"], float(tpl["min_confidence"]), tiling, backend)
    return _det[k]

def _staff_to_subtract(sess, cam):
    if not sess:
        return 0
    verified = db.staff_attendance.count_documents({"session_id": sess["_id"], "verified": True}) > 0
    if not verified:
        return 0
    return 1 if cam.get("subtract_staff") else 0

def _health(cam, status, reason):
    cid = cam["_id"]
    prev = cam.get("status")
    db.cameras.update_one(
        {"_id": cid},
        {"$set": {"status": status, "last_seen": datetime.now(timezone.utc), "last_tamper_reason": reason}},
    )
    if status == "tampered" and reason and prev != "tampered":
        db.camera_health_events.insert_one({
            "centre_id": cam["centre_id"], "camera_id": cam["_id"],
            "status": status, "reason": reason, "ts": datetime.now(timezone.utc)
        })

def process_live_frame(cam, frame):
    if not _sem.acquire(blocking=False):
        return {"accepted": False, "reason": "BUSY"}
    try:
        return _process(cam, frame)
    finally:
        _sem.release()

def _replay_check(cam, frame, sess, now, st):
    """C2: dhash every 60 s; hamming <=3 vs a different session/day -> C2."""
    from app.services.vision.quality import dhash

    dh = dhash(frame)
    day = now.astimezone(IST).date().isoformat()
    sid = str(sess["_id"]) if sess else None
    if time.time() - st.get("fp", 0.0) >= 60:
        st["fp"] = time.time()
        db.frame_fingerprints.insert_one({
            "centre_id": cam["centre_id"], "camera_id": cam["_id"],
            "dhash": dh, "session_id": sid, "day": day, "captured_at": now,
        })
    for fp in db.frame_fingerprints.find({"camera_id": cam["_id"]}).sort("captured_at", -1).limit(50):
        if sum(a != b for a, b in zip(dh, fp["dhash"])) <= 3 and (fp.get("session_id") != sid or fp.get("day") != day):
            return {"type": "C2", "severity": "high", "state": "flagged",
                    "reason": "Identical frame seen in a different session/day (possible replay)."}
    return None


def _process(cam, frame):
    t0, now = time.time(), datetime.now(timezone.utc)
    cid, kid = cam["_id"], cam["centre_id"]
    centre = db.centres.find_one({"_id": kid})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})
    sess = db.sessions.find_one({"centre_id": kid, "start_ts": {"$lte": now}, "end_ts": {"$gte": now}, "status": {"$in": ["scheduled", "active"]}})
    live = cam.get("live") or {}
    interval = int(live.get("interval_s", settings.live_default_interval_s))
    st = _st.setdefault(str(cid), {"gray": None, "t": 0.0, "bad": 0, "hist": deque(maxlen=5), "pt": 0.0, "ev": 0.0, "n": 0, "fp": 0.0})
    q = quality_gate(frame, st["gray"], (t0 - st["t"]) if st["t"] else 0)
    st["gray"], st["t"] = q["gray"], t0
    provisional = cam.get("setup_status") != "approved"
    base = {
        "_id": cid, "centre_id": kid, "centre_code": centre["code"], "centre_name": centre["name"],
        "district": centre.get("district"), "camera_name": cam["name"], "ts": now, "interval_s": interval,
        "session": ({"id": str(sess["_id"]), "label": sess.get("label"), "start_ts": sess["start_ts"], "end_ts": sess["end_ts"]} if sess else None),
        "model_version": None,
    }
    # ensure monitor run
    run = ensure_run(cam, sess, user_id=None, by="user" if not provisional else "system")
    run_id = run["_id"]
    run_started_at = run["started_at"]
    if not q["ok"]:
        st["bad"] += 1
        touch_run(run_id, False, sess["_id"] if sess else None)
        db.live_status.replace_one({"_id": cid}, {**base, "state": "tampered", "people": None, "people_smooth": None,
             "items": {}, "quality": {"ok": False, "reasons": q["reasons"]}, "claimed": None, "thumb_id": None,
             "run_started_at": run_started_at, "elapsed_s": None}, upsert=True)
        _health(cam, "tampered", ",".join(q["reasons"]))
        if sess and not provisional and st["bad"] == 3:
            from app.services.flag_engine import evaluate
            ctx = {"claimed": None, "enrolled": 0, "sanctioned_max": centre["max_trainees"], "tol": tpl["count_tolerance"],
                   "obs": {"observed": None, "ci_low": None, "ci_high": None, "state": "uncertain", "equipment": {}},
                   "equipment_rules": [], "repairs": {}, "repeats": {}, "trainer_verified": False, "camera_tamper": q["reasons"]}
            flags = evaluate(ctx)
            for f in flags:
                f["dedupe_key"] = f"{sess['_id']}:C1:{cid}"
                _raise_flag(kid, f, sess["_id"], cid)
        return {"accepted": True, "state": "tampered", "reasons": q["reasons"], "next_interval_s": interval,
                "run": {"id": str(run_id), "started_at": run_started_at}}
    st["bad"] = 0
    touch_run(run_id, True, sess["_id"] if sess else None)
    _health(cam, "online", None)
    if sess and not provisional:
        c2 = _replay_check(cam, frame, sess, now, st)
        if c2:
            c2["dedupe_key"] = f"{sess['_id']}:C2"
            _raise_flag(kid, c2, sess["_id"], cid)
    det = _detector(tpl, live.get("tiling", False))
    dets = det.detect(frame)
    sub = _staff_to_subtract(sess, cam)
    c = cleanup(dets, frame.shape, cam.get("roi_polygon"), cam.get("zones"), tpl["presence_rule"], sub)
    rules = {r["class"]: r["operability"] for r in tpl["equipment_rules"]}
    items = item_usage(frame, c["equipment"], c["all_people"], rules)
    people = c["people_count"]
    st["hist"].append(people)
    smooth = int(statistics.median(st["hist"]))
    h, w = frame.shape[:2]
    labelled = [(*b[:4], b[5]) for b in c["equipment"]]
    thumb = blurred_thumbnail(frame, [p[:4] for p in c["all_people"]], labelled + [(*p[:4], "person") for p in c["counted_boxes_full"]])
    save_blob(f"live_{cid}", kid, thumb, "live", camera_id=cid)
    if time.time() - st["ev"] >= settings.routine_evidence_every_min * 60 and sess and not provisional:
        save_blob(f"r_{cid}_{int(time.time())}", kid, thumb, "routine", sess["_id"], cid)
        st["ev"] = time.time()
    claim = db.attendance_claims.find_one({"session_id": sess["_id"]}, {"claimed_count": 1}) if sess else None
    state = "provisional" if provisional else ("live" if sess else "idle")
    # FIX: elapsed_s should be non-null for any session state (live or provisional with session)
    elapsed_s = int((now - run_started_at).total_seconds()) if (sess and state in ("live", "provisional")) else None
    db.live_status.replace_one({"_id": cid}, {**base, "state": state, "people": people, "people_smooth": smooth, "items": items,
         "quality": {"ok": True, "reasons": []}, "claimed": claim["claimed_count"] if claim else None,
         "model_version": det.version, "latency_ms": int((time.time() - t0) * 1000), "thumb_id": f"live_{cid}",
         "run_started_at": run_started_at, "elapsed_s": elapsed_s}, upsert=True)
    # FIX: Record snapshots for provisional cameras too when RECORD_PROVISIONAL=True
    # (data_official=False is already set in live_row(), flags get details.provisional=True)
    if sess and (not provisional or settings.record_provisional):
        _record(cam, kid, sess, now, people, len(c["people_boxes"]), items, det.version, int((time.time() - t0) * 1000), st, tpl)
    return {"accepted": True, "state": state, "people": people, "people_smooth": smooth, "items": items,
            "boxes": [{"cls": b[5], "x1": b[0]/w, "y1": b[1]/h, "x2": b[2]/w, "y2": b[3]/h, "conf": round(b[4], 2)}
                      for b in dets], "session": base["session"], "run": {"id": str(run_id), "started_at": run_started_at}, "next_interval_s": interval}

def _record(cam, kid, sess, now, people, raw, items, ver, lat, st, tpl):
    snap = {"centre_id": kid, "camera_id": cam["_id"], "session_id": sess["_id"], "ts": now, "people": people,
            "people_raw": raw, "items": items, "quality": {"ok": True, "reasons": []}, "model_version": ver,
            "latency_ms": lat, "snap_key": f"{cam['_id']}|{int(now.timestamp()*1000)}"}
    try:
        db.snapshots.insert_one(snap)
    except Exception as e:
        if "duplicate" in str(e).lower():
            return
        ledger.append("snapshot", {"doc": snap, "centre_id": str(kid)})
        return
    day = now.astimezone(IST).date().isoformat()
    inc = {"snapshots": 1, "people_sum": people}
    mx = {"people_max": people}
    for c, v in items.items():
        inc[f"items.{c}.present_sum"] = v["present"]
        inc[f"items.{c}.in_use_sum"] = v["in_use"]
        mx[f"items.{c}.present_max"] = v["present"]
    db.daily_summaries.update_one({"centre_id": kid, "date": day},
        {"$inc": inc, "$max": mx, "$min": {"first_seen": now}, "$set": {"last_seen": now, "updated_at": now}}, upsert=True)
    if time.time() - st["pt"] >= settings.live_timeline_gap_s:
        pt = {"ts": now, "people": people, "items": {c: {"present": v["present"], "in_use": v["in_use"]} for c, v in items.items()}}
        db.day_timelines.update_one({"camera_id": cam["_id"], "date": day},
            {"$setOnInsert": {"centre_id": kid}, "$set": {"updated_at": datetime.now(timezone.utc)}, "$push": {"points": {"$each": [pt], "$slice": -2000}}}, upsert=True)
        st["pt"] = time.time()
    db.sessions.update_one({"_id": sess["_id"]}, {"$inc": {"done_captures": 1}, "$min": {"actual_start_ts": now}, "$max": {"actual_end_ts": now}, "$set": {"status": "active"}})
    st["n"] += 1
    base_frames = int(tpl.get("base_frames", 5)) if tpl else 5
    snap_count = db.snapshots.count_documents({"session_id": sess["_id"]})
    if st["n"] >= settings.consolidate_every_snapshots or snap_count == base_frames:
        st["n"] = 0
        consolidate_session(sess["_id"], cam, tpl, final=False)

def _raise_flag(centre_id, flag, session_id, camera_id):
    from app.services.dbfuncs import recompute_risk

    flag["centre_id"] = centre_id
    flag["session_id"] = session_id
    flag["camera_id"] = camera_id
    flag["ts"] = datetime.now(timezone.utc)
    if camera_id:
        cam_doc = db.cameras.find_one({"_id": camera_id})
        if cam_doc and cam_doc.get("setup_status") != "approved":
            flag.setdefault("details", {})["provisional"] = True
    existing = db.flags.find_one({"dedupe_key": flag["dedupe_key"], "status": {"$in": OPEN_STATES}})
    if existing:
        db.flags.update_one(
            {"_id": existing["_id"]},
            {"$set": {"reason": flag["reason"], "severity": flag["severity"], "updated_at": datetime.now(timezone.utc), "details": flag.get("details", {})}},
        )
    else:
        flag.setdefault("status", "open")
        flag.setdefault("events", []).append({"action": "created", "ts": flag["ts"]})
        flag["_id"] = db.flags.insert_one(flag).inserted_id
        ledger.append("flag", flag)
    recompute_risk(centre_id)


OPEN_STATES = ["open", "acknowledged", "centre_responded", "under_review", "escalated"]

def consolidate_session(sid, cam, tpl, final=False):
    snaps = list(db.snapshots.find({"session_id": sid, "camera_id": cam["_id"]}).sort("ts", -1).limit(int(tpl["max_frames"])))
    if not snaps:
        return None
    counts = [s["people"] for s in snaps]
    res = consolidate(counts, tpl["count_tolerance"], float(tpl["agree_ratio"]))
    eq = {}
    for cls in {k for s in snaps for k in s["items"]}:
        pres = [s["items"].get(cls, {}).get("present", 0) for s in snaps]
        use = sum(s["items"].get(cls, {}).get("in_use", 0) for s in snaps)
        tot = max(1, sum(pres))
        eq[cls] = {**consolidate(pres, tpl["count_tolerance"], float(tpl["agree_ratio"]), min_frames=3), "in_use_pct": round(100 * use / tot)}
    state = "ok" if res["consistent"] else "uncertain"
    bucket = snaps[0]["ts"].replace(minute=0, second=0, microsecond=0)
    obs = {"centre_id": cam["centre_id"], "session_id": sid, "camera_id": cam["_id"], "hour_bucket": bucket, "source": "live",
           "observed_count": res["observed"], "ci_low": res["ci_low"], "ci_high": res["ci_high"], "state": state,
           "frames_used": len(snaps), "per_frame_counts": counts[::-1], "equipment": eq, "tamper": [],
           "model_version": snaps[0].get("model_version")}
    prev = db.observations.find_one({"session_id": sid, "camera_id": cam["_id"], "hour_bucket": bucket})
    db.observations.update_one({"session_id": sid, "camera_id": cam["_id"], "hour_bucket": bucket, "source": "live"}, {"$set": obs}, upsert=True)
    if not prev or (prev["observed_count"], prev["ci_low"], prev["ci_high"], prev["state"]) != (obs["observed_count"], obs["ci_low"], obs["ci_high"], state):
        digest = hashlib.sha256("\n".join(f"{s['ts'].isoformat()}|{s['people']}|{json.dumps(s['items'], sort_keys=True)}" for s in snaps).encode()).hexdigest()
        ledger.append("snapshot_batch", {"camera_id": str(cam["_id"]), "session_id": str(sid), "n": len(snaps), "digest": digest,
                     "from_ts": snaps[-1]["ts"].isoformat(), "to_ts": snaps[0]["ts"].isoformat()})
    _update_session_summary(sid, final)
    if final:
        # FIX: 'sess' was undefined; look up session doc by sid
        sess_doc = db.sessions.find_one({"_id": sid})
        if sess_doc:
            interval = int(tpl.get("base_frames", settings.live_default_interval_s))
            timing = session_timing(sess_doc, int((cam.get("live") or {}).get("interval_s", settings.live_default_interval_s)))
            if timing:
                db.sessions.update_one({"_id": sid}, {"$set": timing})
    base_frames = int(tpl.get("base_frames", settings.consolidate_every_snapshots))
    if len(snaps) >= base_frames:
        evaluate_and_raise(sid, cam, tpl, obs, final)
    return obs

def _update_session_summary(sid, final):
    obs = list(db.observations.find({"session_id": sid, "source": "live"}))
    if not obs:
        return
    # Group observations by camera: take the latest observation per camera across session
    cam_obs = {}
    for o in obs:
        c_key = str(o["camera_id"])
        if c_key not in cam_obs or o.get("hour_bucket", datetime.min) > cam_obs[c_key].get("hour_bucket", datetime.min):
            cam_obs[c_key] = o

    total_observed = sum(o["observed_count"] or 0 for o in cam_obs.values())
    lows = [o["ci_low"] for o in cam_obs.values() if o.get("ci_low") is not None]
    highs = [o["ci_high"] for o in cam_obs.values() if o.get("ci_high") is not None]
    ci_low = sum(lows) if lows else None
    ci_high = sum(highs) if highs else None
    state = "ok" if all(o.get("state") == "ok" for o in cam_obs.values()) else "uncertain"
    snapshots = db.snapshots.count_documents({"session_id": sid})
    staff_verified = db.staff_attendance.count_documents({"session_id": sid, "verified": True}) > 0
    claimed = db.attendance_claims.find_one({"session_id": sid}, {"claimed_count": 1})
    claimed_val = claimed["claimed_count"] if claimed else None

    # Aggregate equipment usage across cameras
    eq_summary = {}
    for o in cam_obs.values():
        for cls, eq_data in (o.get("equipment") or {}).items():
            if cls not in eq_summary:
                eq_summary[cls] = {
                    "seen": eq_data.get("observed", 0),
                    "in_use_pct": eq_data.get("in_use_pct", 0),
                    "count": 1,
                }
            else:
                eq_summary[cls]["seen"] += eq_data.get("observed", 0)
                eq_summary[cls]["in_use_pct"] += eq_data.get("in_use_pct", 0)
                eq_summary[cls]["count"] += 1
    final_eq = {
        cls: {
            "seen": d["seen"],
            "in_use_pct": round(d["in_use_pct"] / d["count"]) if d["count"] else 0,
        }
        for cls, d in eq_summary.items()
    }

    db.sessions.update_one({"_id": sid}, {"$set": {
        "summary": {
            "claimed": claimed_val,
            "observed": total_observed,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "state": state,
            "delta": (claimed_val - total_observed) if claimed_val is not None else None,
            "snapshots": snapshots,
            "staff_verified": staff_verified,
            "equipment": final_eq,
        },
        "status": "closed" if final else "active"
    }})

def evaluate_and_raise(sid, cam, tpl, obs, final):
    from app.services.flag_engine import evaluate
    centre = db.centres.find_one({"_id": cam["centre_id"]})
    claimed = db.attendance_claims.find_one({"session_id": sid}, {"claimed_count": 1})
    claimed_val = claimed["claimed_count"] if claimed else None

    # Equipment: read from centre.equipment or centre_equipment collection or trade template
    raw_equipment = (centre or {}).get("equipment") or []
    if not raw_equipment:
        raw_equipment = list(db.centre_equipment.find({"centre_id": cam["centre_id"]}))
    if not raw_equipment and tpl:
        max_trainees = (centre or {}).get("max_trainees", 20)
        raw_equipment = [
            {
                "class": r["class"],
                "label": r.get("label", r["class"]),
                "sanctioned_qty": int(round(r.get("min_units_per_trainee", 1) * max_trainees)),
                "declared_qty": int(round(r.get("min_units_per_trainee", 1) * max_trainees)),
            }
            for r in tpl.get("equipment_rules", [])
        ]

    eq_rules = []
    for e in raw_equipment:
        eq_rules.append({
            "class": e["class"],
            "label": e.get("label") or e["class"],
            "sanctioned": e.get("sanctioned_qty", 0),
            "declared": e.get("declared_qty", 0),
        })

    # Normalise the observation dict for the flag engine
    obs_for_engine = {
        "observed": obs.get("observed_count"),
        "ci_low": obs.get("ci_low"),
        "ci_high": obs.get("ci_high"),
        "state": obs.get("state", "uncertain"),
        "equipment": obs.get("equipment", {}),
    }

    ctx = {
        "claimed": claimed_val,
        "enrolled": db.trainees.count_documents({"centre_id": cam["centre_id"], "active": True}),
        "sanctioned_max": (centre or {}).get("max_trainees", 0),
        "tol": tpl["count_tolerance"],
        "obs": obs_for_engine,
        "equipment_rules": eq_rules,
        "repairs": {r["equipment_class"]: r["qty"] for r in db.repair_declarations.find({"centre_id": cam["centre_id"], "status": "approved"})},
        "repeats": {},
        "trainer_verified": db.staff_attendance.count_documents({"session_id": sid, "verified": True}) > 0,
        "camera_tamper": obs.get("tamper") or [],
    }
    flags = evaluate(ctx)
    for f in flags:
        if not final and f["type"] in ("U1", "C3", "M1"):
            continue
        f["centre_id"] = cam["centre_id"]
        f["session_id"] = sid
        f["camera_id"] = cam["_id"]
        f["dedupe_key"] = f"{sid}:{f['type']}{':' + f.get('class', '') if f.get('class') else ''}"
        f.setdefault("created_at", datetime.now(timezone.utc))
        _raise_flag(cam["centre_id"], f, sid, cam["_id"])
def _spark(camera_id, n=30):
    doc = db.day_timelines.find_one({"camera_id": camera_id}, sort=[("date", -1)])
    if not doc:
        return []
    return [p.get("people") for p in (doc.get("points") or [])[-n:]]


def live_row(cam, centre=None, spark=30):
    """LiveStatus row (plan RESPONSE SHAPES). Applies staleness."""
    from app.core.config import settings
    from app.db.mongo import sign_file_url
    if centre is None:
        centre = db.centres.find_one({"_id": cam["centre_id"]}) or {}
    ls = db.live_status.find_one({"_id": cam["_id"]})
    interval = int((cam.get("live") or {}).get("interval_s", settings.live_default_interval_s))
    provisional = cam.get("setup_status") != "approved"
    row = {
        "camera_id": str(cam["_id"]),
        "camera_name": cam["name"],
        "source_kind": cam.get("source_kind"),
        "centre_id": str(cam["centre_id"]),
        "centre_code": centre.get("code"),
        "centre_name": centre.get("name"),
        "district": centre.get("district"),
        "state": None,
        "error": None,
        "ts": None,
        "age_s": None,
        "interval_s": interval,
        "session": None,
        "people": None,
        "people_smooth": None,
        "claimed": None,
        "items": {},
        "labels": {e["class"]: e["label"] for e in centre.get("equipment", [])},
        "quality": None,
        "thumb_url": None,
        "spark": _spark(cam["_id"], spark) if spark else [],
        "model_version": None,
        "run_started_at": None,
        "elapsed_s": None,
        "data_official": not provisional,
    }
    if provisional:
        if settings.record_provisional:
            # Include provisional data when RECORD_PROVISIONAL is true
            if ls:
                age = (datetime.now(timezone.utc) - ls["ts"]).total_seconds()
                row.update({
                    "state": "provisional",
                    "error": ls.get("error"),
                    "ts": ls["ts"],
                    "age_s": round(age, 1),
                    "interval_s": ls.get("interval_s", interval),
                    "session": ls.get("session"),
                    "people": ls.get("people"),
                    "people_smooth": ls.get("people_smooth"),
                    "claimed": ls.get("claimed"),
                    "items": ls.get("items") or {},
                    "labels": {**row["labels"], **{cls: cls for cls in (ls.get("items") or {})}},
                    "quality": ls.get("quality"),
                    "thumb_url": None,  # never for provisional
                    "model_version": ls.get("model_version"),
                    "run_started_at": ls.get("run_started_at"),
                    "elapsed_s": ls.get("elapsed_s"),
                })
            else:
                row["state"] = "provisional"
            return row
        else:
            row["state"] = "provisional"
            return row
    if not ls:
        row["state"] = "offline"
        return row
    age = (datetime.now(timezone.utc) - ls["ts"]).total_seconds()
    row.update({
        "state": "offline" if age > 3 * ls.get("interval_s", interval) else ls.get("state", "idle"),
        "error": ls.get("error") if ls.get("state") == "error" else None,
        "ts": ls["ts"],
        "age_s": round(age, 1),
        "interval_s": ls.get("interval_s", interval),
        "session": ls.get("session"),
        "people": ls.get("people"),
        "people_smooth": ls.get("people_smooth"),
        "claimed": ls.get("claimed"),
        "items": ls.get("items") or {},
        "labels": {**row["labels"], **{cls: cls for cls in (ls.get("items") or {})}},
        "quality": ls.get("quality"),
        "thumb_url": sign_file_url("evidence", ls["thumb_id"]) if ls.get("thumb_id") else None,
        "model_version": ls.get("model_version"),
        "run_started_at": ls.get("run_started_at"),
        "elapsed_s": ls.get("elapsed_s"),
    })
    return row


def live_rows(centre_ids=None, district=None, state=None, q=None, limit=200):
    """LiveStatus[] with counts (govt /live and centre /my/live)."""
    from app.core.config import settings
    cq = {}
    if centre_ids is not None:
        cq["_id"] = {"$in": centre_ids}
    if district:
        cq["district"] = district
    centres = {c["_id"]: c for c in db.centres.find(cq)}
    cams = list(db.cameras.find({"centre_id": {"$in": list(centres)}}).limit(limit)) if centres else []
    rows = []
    for cam in cams:
        row = live_row(cam, centres[cam["centre_id"]])
        if state and row["state"] != state:
            continue
        if q and q.lower() not in f"{row['camera_name']} {row['centre_code']} {row['centre_name']}".lower():
            continue
        # Add compliance_summary for live sessions
        if row.get("session") and row["session"].get("id"):
            from app.routers.compliance import _compute_compliance
            try:
                comp = _compute_compliance(cam["centre_id"], row["session"]["id"])
                row["compliance_summary"] = {
                    "level": comp["summary"]["level"],
                    "headline": comp["summary"]["headline"],
                    "verdict": comp["people"]["verdict"],
                }
            except Exception:
                pass
        rows.append(row)
    counts = {"live": 0, "idle": 0, "offline": 0, "tampered": 0, "provisional": 0, "error": 0}
    for r in rows:
        counts[r["state"] if r["state"] in counts else "idle"] += 1
    return rows, counts


def session_status_tick():
    """scheduled -> active -> closed/missed (plan: SERVICES).
    A session becomes 'missed' if end_ts passed and it has zero snapshots.
    It becomes 'closed' only if it has at least one snapshot.
    """
    from app.services.monitor import end_run, session_timing

    now = datetime.now(timezone.utc)
    for s in db.sessions.find({"status": "scheduled", "start_ts": {"$lte": now}, "end_ts": {"$gte": now}}):
        cams = list(db.cameras.find({"centre_id": s["centre_id"], "setup_status": "approved"}))
        interval = int((cams[0].get("live") or {}).get("interval_s", settings.live_default_interval_s)) if cams else settings.live_default_interval_s
        planned = max(1, int((s["end_ts"] - s["start_ts"]).total_seconds() / interval))
        db.sessions.update_one(
            {"_id": s["_id"]},
            [{"$set": {"status": "active", "planned_captures": planned, "kind": {"$ifNull": ["$kind", "scheduled"]}}}]
        )
    for s in db.sessions.find({"status": {"$in": ["scheduled", "active"]}, "end_ts": {"$lt": now}}):
        # FIX: Include provisional cameras when RECORD_PROVISIONAL=True
        if settings.record_provisional:
            cams = list(db.cameras.find({"centre_id": s["centre_id"]}))
        else:
            cams = list(db.cameras.find({"centre_id": s["centre_id"], "setup_status": "approved"}))
        for cam in cams:
            try:
                centre = db.centres.find_one({"_id": s["centre_id"]})
                tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]}) if centre else None
                if tpl:
                    consolidate_session(s["_id"], cam, tpl, final=True)
            except Exception:
                continue
        # FIX: Use actual snapshot count as authoritative source (not whether consolidate ran without exception)
        snap_count = db.snapshots.count_documents({"session_id": s["_id"]})
        has_snaps = snap_count > 0
        if not has_snaps:
            db.sessions.update_one(
                {"_id": s["_id"]},
                [{"$set": {"status": "missed", "ended_at": datetime.now(timezone.utc), "kind": {"$ifNull": ["$kind", "scheduled"]}}}]
            )
            centre = db.centres.find_one({"_id": s["centre_id"]})
            is_live_or_prov = (centre and (centre.get("status") == "live" or (settings.record_provisional and len(cams) > 0)))
            claim = db.attendance_claims.find_one({"session_id": s["_id"]})
            if claim and is_live_or_prov:
                c3_flag = {
                    "type": "C3",
                    "severity": "high",
                    "state": "flagged",
                    "status": "open",
                    "dedupe_key": f"{s['_id']}:C3",
                    "centre_id": s["centre_id"],
                    "session_id": s["_id"],
                    "camera_id": None,
                    "reason": "Attendance claimed but the camera did not run",
                    "created_at": datetime.now(timezone.utc),
                }
                _raise_flag(s["centre_id"], c3_flag, s["_id"], None)
            elif is_live_or_prov and s.get("kind") != "adhoc":
                m1_flag = {
                    "type": "M1",
                    "severity": "medium",
                    "state": "flagged",
                    "status": "open",
                    "dedupe_key": f"{s['_id']}:M1",
                    "centre_id": s["centre_id"],
                    "session_id": s["_id"],
                    "camera_id": None,
                    "reason": "Scheduled session ended with no camera data (session not held)",
                    "created_at": datetime.now(timezone.utc),
                }
                _raise_flag(s["centre_id"], m1_flag, s["_id"], None)
        else:
            db.sessions.update_one(
                {"_id": s["_id"]},
                [{"$set": {"status": "closed", "ended_at": datetime.now(timezone.utc), "kind": {"$ifNull": ["$kind", "scheduled"]}}}]
            )
            # end running runs of the session
            db.monitor_runs.update_many({"session_id": s["_id"], "status": "running"}, {"$set": {"status": "ended", "end_reason": "session_end"}})
            timing = session_timing(s, int((cams[0].get("live") or {}).get("interval_s", settings.live_default_interval_s)) if cams else settings.live_default_interval_s)
            if timing:
                db.sessions.update_one(
                {"_id": s["_id"]},
                [{"$set": {**timing, "kind": {"$ifNull": ["$kind", "scheduled"]}}}]
            )
        db.daily_summaries.update_one(
            {"centre_id": s["centre_id"], "date": s["session_date"]},
            {"$set": {"updated_at": datetime.now(timezone.utc)}},
            upsert=True,
        )


def daily_rollup_fix():
    """Hourly: recompute today's daily_summaries flag counters."""
    today = datetime.now(IST).date().isoformat()
    for c in db.centres.find({}, {"_id": 1}):
        cid = c["_id"]
        start = datetime.fromisoformat(today).replace(tzinfo=IST).astimezone(timezone.utc)
        agg = db.flags.aggregate([
            {"$match": {"centre_id": cid, "created_at": {"$gte": start}}},
            {"$group": {"_id": "$severity", "n": {"$sum": 1}}},
        ])
        counts = {r["_id"]: r["n"] for r in agg}
        db.daily_summaries.update_one(
            {"centre_id": cid, "date": today},
            {"$set": {
                "flags_total": sum(counts.values()),
                "flags_open": db.flags.count_documents({"centre_id": cid, "created_at": {"$gte": start}, "status": {"$in": OPEN_LIST}}),
                "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )


OPEN_LIST = ["open", "acknowledged", "centre_responded", "under_review", "escalated"]
