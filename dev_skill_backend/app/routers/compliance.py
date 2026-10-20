from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from statistics import median

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo import DESCENDING

from app.core.config import settings
from app.core.deps import require
from app.db.mongo import db, oid, ser
from app.services.consolidate import consolidate
from app.services.flag_engine import evaluate

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")


def _e(s, code, msg):
    raise HTTPException(s, detail={"detail": msg, "code": code})


def _get_session(cid, session_id=None):
    """Get session: if session_id provided use it; else active; else most recent today; else None."""
    now = datetime.now(timezone.utc)
    if session_id:
        s = db.sessions.find_one({"_id": oid(session_id), "centre_id": cid})
        return s
    # active session
    s = db.sessions.find_one({"centre_id": cid, "start_ts": {"$lte": now}, "end_ts": {"$gte": now}, "status": {"$in": ["scheduled", "active"]}})
    if s:
        return s
    # most recent today
    today = now.astimezone(IST).date().isoformat()
    s = db.sessions.find_one({"centre_id": cid, "session_date": today}, sort=[("start_ts", DESCENDING)])
    return s


def _compute_compliance(cid, session_id=None):
    """Core compliance computation shared by centre and govt."""
    s = _get_session(cid, session_id)
    if not s:
        return {"session": None, "as_of": datetime.now(timezone.utc), "snapshots": 0, "window": 0,
                "people": {"enrolled": 0, "sanctioned_max": 0, "claimed": None, "counted": None,
                           "ci_low": None, "ci_high": None, "state": "no_data", "delta": None,
                           "margin": None, "verdict": "waiting", "text": "No session found."},
                "equipment": [], "flags": [], "summary": {"level": "waiting", "headline": "No session found."}}

    centre = db.centres.find_one({"_id": cid})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]}) if centre else None
    if not tpl:
        return {"session": ser(s), "as_of": datetime.now(timezone.utc), "snapshots": 0, "window": 0,
                "people": {"enrolled": 0, "sanctioned_max": 0, "claimed": None, "counted": None,
                           "ci_low": None, "ci_high": None, "state": "no_data", "delta": None,
                           "margin": None, "verdict": "waiting", "text": "No trade template."},
                "equipment": [], "flags": [], "summary": {"level": "waiting", "headline": "No trade template."}}

    # Snapshots across all cameras for this session
    all_snaps = list(db.snapshots.find({"session_id": s["_id"]}).sort("ts", -1))
    total_snaps = len(all_snaps)
    max_frames = int(tpl.get("max_frames", 40))
    window = min(max_frames, total_snaps)

    # People consolidation across cameras
    if total_snaps < 3:
        people_verdict = "waiting"
        counted = None
        ci_low = None
        ci_high = None
        state = "no_data"
    else:
        # Sum observed across cameras per snapshot, then consolidate
        # Group snapshots by camera, take latest per camera
        cam_latest = {}
        for snap in all_snaps:
            cam_id = snap["camera_id"]
            if cam_id not in cam_latest:
                cam_latest[cam_id] = snap
        # Sum people per snapshot (for each snapshot, sum across cameras)
        # Actually we need per-camera consolidation then sum observed
        camera_obs = []
        for cam_id, snap in cam_latest.items():
            cam_snaps = list(db.snapshots.find({"session_id": s["_id"], "camera_id": cam_id}).sort("ts", -1).limit(window))
            counts = [sn["people"] for sn in cam_snaps]
            res = consolidate(counts, tpl["count_tolerance"], float(tpl["agree_ratio"]))
            camera_obs.append(res)
        # Sum observed across cameras
        total_observed = sum(o["observed"] or 0 for o in camera_obs if o["observed"] is not None)
        lows = [o["ci_low"] for o in camera_obs if o["ci_low"] is not None]
        highs = [o["ci_high"] for o in camera_obs if o["ci_high"] is not None]
        ci_low = sum(lows) if lows else None
        ci_high = sum(highs) if highs else None
        counted = total_observed
        state = "ok" if all(o["consistent"] for o in camera_obs) else "uncertain"

    # Claim
    claim = db.attendance_claims.find_one({"session_id": s["_id"]}, {"claimed_count": 1})
    claimed = claim["claimed_count"] if claim else None

    # Enrolled and sanctioned
    enrolled = db.trainees.count_documents({"centre_id": cid, "active": True})
    sanctioned_max = centre["max_trainees"] if centre else 0

    # People verdict and text
    margin_val = None
    delta = None
    verdict = "waiting"
    text = ""

    if counted is None:
        verdict = "waiting"
        text = "Waiting for sufficient frames (need 3+)."
    elif claimed is None:
        verdict = "unclaimed"
        text = f"Camera counted {counted}. No attendance claim was made."
    else:
        delta = claimed - counted
        margin_val = max(tpl["count_tolerance"], int(round(0.10 * claimed)))
        if claimed > 0 and counted == 0:
            verdict = "ghost"
            text = f"Session claimed {claimed} present but camera saw nobody."
        elif claimed > counted + margin_val:
            verdict = "inflated"
            text = f"Claimed {claimed}, camera counted {counted} (range {ci_low}-{ci_high}, margin {margin_val})."
        elif counted > claimed + margin_val:
            verdict = "unregistered"
            text = f"Camera counted {counted} but only {claimed} claimed."
        elif counted > sanctioned_max:
            verdict = "over_capacity"
            text = f"Observed {counted} exceeds sanctioned maximum {sanctioned_max}."
        else:
            verdict = "match"
            text = f"Claimed {claimed}, camera counted {counted} (range {ci_low}-{ci_high}, margin {margin_val})."

    # Equipment: per class median over window
    raw_equipment = centre.get("equipment") or []
    if not raw_equipment:
        raw_equipment = list(db.centre_equipment.find({"centre_id": cid}))
    if not raw_equipment and tpl:
        max_trainees = centre.get("max_trainees", 20)
        raw_equipment = [
            {
                "class": r["class"],
                "label": r.get("label", r["class"]),
                "sanctioned_qty": int(round(r.get("min_units_per_trainee", 1) * max_trainees)),
                "declared_qty": int(round(r.get("min_units_per_trainee", 1) * max_trainees)),
            }
            for r in tpl.get("equipment_rules", [])
        ]

    equipment_rules = []
    for e in raw_equipment:
        equipment_rules.append({
            "class": e["class"],
            "label": e.get("label") or e["class"],
            "sanctioned": e.get("sanctioned_qty", 0),
            "declared": e.get("declared_qty", 0),
        })

    equipment_out = []
    for r in equipment_rules:
        cls = r["class"]
        declared = r["declared"]
        sanctioned = r["sanctioned"]
        # Collect seen per camera per snapshot window
        seen_values = []
        in_use_values = []
        if total_snaps >= 3:
            for cam in db.cameras.find({"centre_id": cid}):
                cam_snaps = list(db.snapshots.find({"session_id": s["_id"], "camera_id": cam["_id"]}).sort("ts", -1).limit(window))
                for snap in cam_snaps:
                    item = snap.get("items", {}).get(cls)
                    if item:
                        seen_values.append(item.get("present", 0))
                        in_use_values.append(item.get("in_use", 0))
                    else:
                        seen_values.append(0)
                        in_use_values.append(0)

        seen = int(median(seen_values)) if seen_values else None
        seen_max = max(seen_values) if seen_values else None
        in_use = int(median(in_use_values)) if in_use_values else None
        # FIX: Clamp idle/off at 0 to avoid negative values
        idle = max(0, declared - in_use) if in_use is not None and declared is not None else None
        off = max(0, sanctioned - in_use) if in_use is not None and sanctioned is not None else None
        in_use_pct = round(100 * in_use / sanctioned) if in_use is not None and sanctioned else None

        # Equipment verdict
        if seen is None:
            eq_verdict = "waiting"
            eq_text = f"{r['label']}: waiting for frames."
        elif declared != sanctioned:
            eq_verdict = "declaration_mismatch"
            eq_text = f"{r['label']}: declared {declared} vs sanctioned {sanctioned}."
        elif seen < max(1, sanctioned):
            eq_verdict = "missing"
            eq_text = f"{r['label']}: sanctioned {sanctioned}, camera saw {seen}."
        elif in_use is not None and in_use == 0 and sanctioned > 0:
            eq_verdict = "non_operational"
            eq_text = f"{r['label']}: sanctioned {sanctioned}, none in use."
        else:
            eq_verdict = "ok"
            eq_text = f"{r['label']}: sanctioned {sanctioned}, seen {seen}, in use {in_use}."

        equipment_out.append({
            "class": cls,
            "label": r["label"],
            "sanctioned": sanctioned,
            "declared": declared,
            "seen": seen,
            "seen_max": seen_max,
            "in_use": in_use,
            "idle": idle,
            "off": off,
            "in_use_pct": in_use_pct,
            "verdict": eq_verdict,
            "text": eq_text,
        })

    # Flags for this session
    session_flags = list(db.flags.find({"session_id": s["_id"]}).sort("created_at", -1))
    flags_out = []
    for f in session_flags:
        flags_out.append({
            "id": str(f["_id"]),
            "type": f.get("type"),
            "severity": f.get("severity"),
            "status": f.get("status"),
            "reason": f.get("reason"),
            "created_at": f.get("created_at"),
        })

    # Summary level
    all_verdicts = [verdict] + [e["verdict"] for e in equipment_out]
    critical_verdicts = ["critical", "high"]
    has_critical = any(v in ["critical", "high"] for v in all_verdicts)
    # Map severity to level
    level = "ok"
    if any(v in ["inflated", "ghost", "over_capacity", "missing", "non_operational"] for v in all_verdicts):
        if any(v in ["inflated", "ghost", "over_capacity"] for v in all_verdicts):
            level = "critical"
        else:
            level = "attention"
    elif verdict == "waiting":
        level = "waiting"
    elif verdict in ["unclaimed", "unverifiable", "unregistered"]:
        level = "attention"

    headlines = {
        "waiting": "Waiting for sufficient data.",
        "ok": "All counts match.",
        "attention": "Review recommended.",
        "critical": "Immediate action required.",
    }
    summary = {"level": level, "headline": headlines.get(level, "Unknown")}

    return {
        "session": ser(s),
        "as_of": datetime.now(timezone.utc),
        "snapshots": total_snaps,
        "window": window,
        "people": {
            "enrolled": enrolled,
            "sanctioned_max": sanctioned_max,
            "claimed": claimed,
            "counted": counted,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "state": state,
            "delta": delta,
            "margin": margin_val,
            "verdict": verdict,
            "text": text,
        },
        "equipment": equipment_out,
        "flags": flags_out,
        "summary": summary,
    }


@router.get("/my/compliance")
def my_compliance(
    session_id: str | None = None,
    user=Depends(require("centre_admin", "trainer")),
):
    cid = user["centre_id"]
    return ser(_compute_compliance(cid, session_id))


@router.get("/centres/{cid}/compliance")
def govt_compliance(
    cid: str,
    session_id: str | None = None,
    user=Depends(require("super_admin", "scheme_officer", "auditor")),
):
    return ser(_compute_compliance(oid(cid), session_id))