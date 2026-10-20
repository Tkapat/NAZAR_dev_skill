from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from bson import ObjectId as OID
from app.db.mongo import db
from app.services.vision.usage import compute_in_use_pct

IST = ZoneInfo("Asia/Kolkata")
OPEN = ["open", "acknowledged", "centre_responded", "under_review", "escalated"]
SEVN = {"$switch": {"branches": [{"case": {"$eq": ["$severity", "critical"]}, "then": 4},
          {"case": {"$eq": ["$severity", "high"]}, "then": 3}, {"case": {"$eq": ["$severity", "medium"]}, "then": 2}], "default": 1}}
SEV = {4: "critical", 3: "high", 2: "medium", 1: "low"}


def calendar_range(centre_id, d_from: str, d_to: str):
    if isinstance(centre_id, str):
        centre_id = OID(centre_id)
    start = datetime.fromisoformat(d_from).replace(tzinfo=IST).astimezone(timezone.utc)
    end = (datetime.fromisoformat(d_to) + timedelta(days=1)).replace(tzinfo=IST).astimezone(timezone.utc)
    summ = {s["date"]: s for s in db.daily_summaries.find({"centre_id": centre_id, "date": {"$gte": d_from, "$lte": d_to}})}
    sess = {s["_id"]: s for s in db.sessions.aggregate([{"$match": {"centre_id": centre_id, "session_date": {"$gte": d_from, "$lte": d_to}}},
        {"$group": {"_id": "$session_date", "n": {"$sum": 1}, "claimed": {"$sum": {"$ifNull": ["$summary.claimed", 0]}},
                  "observed": {"$sum": {"$ifNull": ["$summary.observed", 0]}}, "have": {"$sum": {"$cond": [{"$ne": ["$summary", None]}, 1, 0]}},
                  "planned": {"$sum": "$planned_captures"}, "done": {"$sum": "$done_captures"},
                  "held": {"$sum": {"$cond": [{"$eq": ["$status", "closed"]}, 1, 0]}},
                  "missed": {"$sum": {"$cond": [{"$eq": ["$status", "missed"]}, 1, 0]}},
                  "cancelled": {"$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}},
                  "scheduled_future": {"$sum": {"$cond": [{"$and": [{"$eq": ["$status", "scheduled"]}, {"$gt": ["$start_ts", datetime.now(timezone.utc)]}]}, 1, 0]}}}}])}
    fl = {f["_id"]: f for f in db.flags.aggregate([{"$match": {"centre_id": centre_id, "created_at": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at", "timezone": "Asia/Kolkata"}},
                  "total": {"$sum": 1}, "open": {"$sum": {"$cond": [{"$in": ["$status", OPEN]}, 1, 0]}}, "sev": {"$max": SEVN}}}])}
    hol = {h["holiday_date"] for h in db.holidays.find({"centre_id": centre_id, "holiday_date": {"$gte": d_from, "$lte": d_to}})}
    today = datetime.now(IST).date().isoformat()
    out = []
    d = date.fromisoformat(d_from)
    while d <= date.fromisoformat(d_to):
        k = d.isoformat()
        s, ss, f = summ.get(k), sess.get(k), fl.get(k)
        snaps = (s or {}).get("snapshots", 0)
        # status precedence: holiday | cancelled (all cancelled) | upcoming | none | missed | partial | no_data | critical | attention | ok
        status = "ok"
        if k in hol:
            status = "holiday"
        elif ss and ss.get("cancelled", 0) == ss["n"] and ss["n"] > 0:
            status = "cancelled"
        elif k > today or (k == today and ss and ss.get("scheduled_future", 0) == ss["n"] and ss["n"] > 0):
            status = "upcoming"
        elif not ss and not s:
            status = "none"
        elif ss and ss.get("missed", 0) > 0 and ss.get("held", 0) == 0:
            status = "missed"
        elif ss and ss.get("missed", 0) > 0 and ss.get("held", 0) > 0:
            status = "partial"
        elif s and snaps == 0:
            status = "no_data"
        elif f and f["sev"] >= 3:
            status = "critical"
        elif f and f["open"] > 0:
            status = "attention"
        inuse = sum(v.get("in_use_sum", 0) for v in (s or {}).get("items", {}).values())
        pres = sum(v.get("present_sum", 0) for v in (s or {}).get("items", {}).values())
        monitored_min = round((ss or {}).get("monitored_min", 0)) if ss else None
        scheduled_min = round((ss or {}).get("scheduled_min", 0)) if ss else None
        uptime_pct = round(100 * monitored_min / scheduled_min) if monitored_min and scheduled_min else None
        out.append({
            "date": k, "status": status, "snapshots": snaps,
            "updates": snaps + (f["total"] if f else 0) + (s or {}).get("claims", 0) + (s or {}).get("health_events", 0),
            "sessions": ss["n"] if ss else 0,
            "sessions_held": ss.get("held", 0) if ss else 0,
            "sessions_missed": ss.get("missed", 0) if ss else 0,
            "sessions_cancelled": ss.get("cancelled", 0) if ss else 0,
            "people_max": (s or {}).get("people_max"),
            "people_avg": round(s["people_sum"] / snaps, 1) if snaps else None,
            "claimed": ss["claimed"] if ss and ss["have"] else None,
            "observed": ss["observed"] if ss and ss["have"] else None,
            "delta": (ss["claimed"] - ss["observed"]) if ss and ss["have"] else None,
            "flags": {"total": f["total"], "open": f["open"], "max_severity": SEV[f["sev"]]} if f else None,
            "uptime_pct": uptime_pct,
            "monitored_min": monitored_min,
            "scheduled_min": scheduled_min,
            "in_use_pct": round(100 * inuse / pres) if pres else None
        })
        d += timedelta(days=1)
    return out

def day_detail(centre_id, date_str: str):
    from app.db.mongo import ser, sign_file_url

    if isinstance(centre_id, str):
        centre_id = OID(centre_id)
    start = datetime.fromisoformat(date_str).replace(tzinfo=IST).astimezone(timezone.utc)
    end = (datetime.fromisoformat(date_str) + timedelta(days=1)).replace(tzinfo=IST).astimezone(timezone.utc)
    summ_row = db.daily_summaries.find_one({"centre_id": centre_id, "date": date_str})
    sess_docs = list(db.sessions.find({"centre_id": centre_id, "session_date": date_str}).sort("start_ts", 1))
    runs_by_sess: dict[str, list[dict]] = {}
    sess_ids = [s["_id"] for s in sess_docs]
    if sess_ids:
        for r in db.monitor_runs.find({"session_id": {"$in": sess_ids}}).sort("started_at", 1):
            runs_by_sess.setdefault(str(r["session_id"]), []).append(r)
    sess_list = []
    for sess in sess_docs:
        sm = sess.get("summary") or {}
        sid = str(sess["_id"])
        sess_list.append({
            "id": sid, "batch": str(sess.get("batch_id") or "") or None,
            "label": sess.get("label"), "start_ts": sess["start_ts"], "end_ts": sess["end_ts"],
            "state": sess.get("status"), "cancel_reason": sess.get("cancel_reason"),
            "actual_start_ts": sess.get("actual_start_ts"), "actual_end_ts": sess.get("actual_end_ts"),
            "monitored_s": sess.get("monitored_s"), "coverage_pct": sess.get("coverage_pct"),
            "late_start_s": sess.get("late_start_s"),
            "claimed": sm.get("claimed"), "observed": sm.get("observed"),
            "ci_low": sm.get("ci_low"), "ci_high": sm.get("ci_high"), "delta": sm.get("delta"),
            "staff_verified": sm.get("staff_verified"), "snapshots": sm.get("snapshots", 0),
            "equipment": sm.get("equipment", {}),
            "runs": [
                {
                    "id": str(r["_id"]),
                    "started_at": r.get("started_at"),
                    "ended_at": r.get("ended_at"),
                    "end_reason": r.get("end_reason"),
                    "by": r.get("by"),
                    "by_name": r.get("started_by"),
                    "duration_s": r.get("duration_s"),
                }
                for r in runs_by_sess.get(sid, [])
            ],
        })
    pts_by_cam = {}
    for doc in db.day_timelines.find({"centre_id": centre_id, "date": date_str}):
        for p in doc.get("points") or []:
            row = dict(p)
            row["camera_id"] = str(doc.get("camera_id"))
            pts_by_cam.setdefault(str(doc.get("camera_id")), []).append(row)
    merged = [p for pts in pts_by_cam.values() for p in pts]
    merged.sort(key=lambda x: x.get("ts"))
    downsampled = _downsample_timeline(merged, 240)
    interval_s = downsampled[0].get("interval_s", 30) if downsampled else 30
    eq_items = (summ_row or {}).get("items", {})
    centre = db.centres.find_one({"_id": centre_id})
    raw_eq = (centre or {}).get("equipment", [])
    if not raw_eq:
        raw_eq = list(db.centre_equipment.find({"centre_id": centre_id}))
    declared = {e["class"]: {"sanctioned": e.get("sanctioned_qty", 0), "declared": e.get("declared_qty", 0), "label": e.get("label", e["class"])} for e in raw_eq}
    repairs = {r["equipment_class"]: r for r in db.repair_declarations.find({"centre_id": centre_id, "status": "approved"})}
    snaps_total = (summ_row or {}).get("snapshots", 0)
    equipment = []
    all_classes = set(declared.keys()) | set(eq_items.keys())
    for cls in sorted(all_classes):
        dec = declared.get(cls, {"sanctioned": 0, "declared": 0, "label": cls})
        v = eq_items.get(cls, {})
        rep = repairs.get(cls, {})
        pres_sum = v.get("present_sum", 0)
        in_use_sum = v.get("in_use_sum", 0)
        equipment.append({
            "class": cls, "label": dec.get("label") or cls,
            "sanctioned": dec.get("sanctioned", 0), "declared": dec.get("declared", 0),
            "present_avg": round(pres_sum / max(1, snaps_total), 2) if snaps_total else 0,
            "present_max": v.get("present_max", 0),
            "in_use_avg": round(in_use_sum / max(1, snaps_total), 2) if snaps_total else 0,
            "in_use_pct": round(100 * in_use_sum / max(1, pres_sum)) if pres_sum else 0,
            "status": "repair_approved" if rep.get("status") == "approved" else "ok",
        })
    flags = list(db.flags.find({"centre_id": centre_id, "created_at": {"$gte": start, "$lt": end}}).sort("created_at", 1))
    flag_rows = []
    for f in flags:
        flag_rows.append({
            "id": str(f["_id"]), "type": f.get("type"), "severity": f.get("severity"),
            "status": f.get("status"), "reason": f.get("reason"), "created_at": f.get("created_at"),
            "evidence_urls": [sign_file_url("evidence", eid) for eid in f.get("evidence_ids", [])],
        })
    evidence = list(db.evidence_blobs.find({"centre_id": centre_id, "created_at": {"$gte": start, "$lt": end}, "kind": {"$in": ["routine", "flag"]}}))
    evidence_rows = [{"id": str(e["_id"]), "ts": e.get("created_at"), "kind": e.get("kind"), "url": sign_file_url("evidence", str(e["_id"]))} for e in evidence]
    health = list(db.camera_health_events.find({"centre_id": centre_id, "ts": {"$gte": start, "$lt": end}}).sort("ts", 1))
    health_rows = [{"ts": h.get("ts"), "status": h.get("status"), "reason": h.get("reason"), "camera_id": str(h.get("camera_id"))} for h in health]
    events = []
    for sess in sess_docs:
        events.append({"ts": sess["start_ts"], "kind": "session_open", "text": f"Session {sess.get('label', '')} started"})
        events.append({"ts": sess["end_ts"], "kind": "session_close", "text": f"Session {sess.get('label', '')} ended"})
        if sess.get("actual_start_ts"):
            events.append({"ts": sess["actual_start_ts"], "kind": "session_actual_start", "text": f"Session {sess.get('label', '')} actually started"})
        if sess.get("actual_end_ts"):
            events.append({"ts": sess["actual_end_ts"], "kind": "session_actual_end", "text": f"Session {sess.get('label', '')} actually ended"})
    for sid, runs in runs_by_sess.items():
        for r in runs:
            cam = db.cameras.find_one({"_id": r.get("camera_id")}, {"name": 1})
            cam_name = (cam or {}).get("name", "camera")
            if r.get("started_at"):
                events.append({"ts": r["started_at"], "kind": "monitor_start", "text": f"Monitoring started on {cam_name}"})
            if r.get("ended_at"):
                reason = r.get("end_reason") or "manual"
                events.append({"ts": r["ended_at"], "kind": "monitor_stop", "text": f"Monitoring stopped on {cam_name} ({reason})"})
    for c in db.attendance_claims.find({"session_id": {"$in": sess_ids}}):
        events.append({"ts": c.get("marked_at"), "kind": "claim", "text": f"Claim submitted: {c.get('claimed_count', 0)} trainees"})
    for h in health_rows:
        events.append({"ts": h["ts"], "kind": "health", "text": f"Camera {h.get('camera_id')}: {h['status']} - {h.get('reason', '')}"})
    for f in flag_rows:
        events.append({"ts": f["created_at"], "kind": "flag", "text": f"Flag {f['type']}: {f['reason']}"})
    events.sort(key=lambda x: x["ts"] or start)
    day_row = (calendar_range(centre_id, date_str, date_str) or [{}])[0]
    monitored_min = day_row.get("monitored_min")
    scheduled_min = day_row.get("scheduled_min")
    uptime_pct = day_row.get("uptime_pct")
    return {
        "date": date_str,
        "summary": {**day_row, "monitored_min": monitored_min, "scheduled_min": scheduled_min, "uptime_pct": uptime_pct},
        "sessions": sess_list,
        "timeline": {"interval_s": interval_s, "points": downsampled},
        "equipment": equipment,
        "flags": flag_rows,
        "evidence": evidence_rows,
        "camera_health": health_rows,
        "events": events,
    }

def _downsample_timeline(points, max_points):
    if len(points) <= max_points:
        return points
    step = len(points) / max_points
    return [points[int(i * step)] for i in range(max_points)]

def day_snapshots(centre_id, date_str, limit=25, cursor=None):
    from app.db.mongo import ser

    if isinstance(centre_id, str):
        centre_id = OID(centre_id)
    start = datetime.fromisoformat(date_str).replace(tzinfo=IST).astimezone(timezone.utc)
    end = (datetime.fromisoformat(date_str) + timedelta(days=1)).replace(tzinfo=IST).astimezone(timezone.utc)
    q = {"centre_id": centre_id, "ts": {"$gte": start, "$lt": end}}
    if cursor:
        q["_id"] = {"$lt": oid(cursor)}
    items = list(db.snapshots.find(q).sort("_id", -1).limit(limit + 1))
    next_cursor = str(items[-1]["_id"]) if len(items) > limit else None
    if len(items) > limit:
        items = items[:limit]
    return {"items": [ser(i) for i in items], "next_cursor": next_cursor}

def oid(s):
    from bson import ObjectId
    return ObjectId(s)