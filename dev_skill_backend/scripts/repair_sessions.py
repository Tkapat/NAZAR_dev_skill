from datetime import datetime, timezone
from app.db.mongo import db


def repair_sessions():
    """Fix sessions with incorrect status and overlapping demo sessions."""
    changes = 0
    
    # 1. Sessions with status closed/active, end_ts passed, and zero snapshots -> missed
    now = datetime.now(timezone.utc)
    for s in db.sessions.find({"status": {"$in": ["closed", "active"]}, "end_ts": {"$lt": now}}):
        snap_count = db.snapshots.count_documents({"session_id": s["_id"]})
        if snap_count == 0:
            db.sessions.update_one(
                {"_id": s["_id"]},
                {"$set": {"status": "missed", "ended_at": now}},
            )
            print(f"Set session {s['_id']} status to 'missed' (was {s['status']}, zero snapshots)")
            changes += 1
    
    # 2. Overlapping demo sessions (adhoc) - keep first, cancel others
    for centre in db.centres.find({}, {"_id": 1}):
        cid = centre["_id"]
        today = datetime.now(timezone.utc).astimezone().date().isoformat()
        demos = list(db.sessions.find({"centre_id": cid, "kind": "adhoc", "session_date": today}).sort("start_ts", 1))
        if len(demos) <= 1:
            continue
        # Check for overlaps
        keep = demos[0]
        for demo in demos[1:]:
            if demo["start_ts"] < keep["end_ts"] and demo["end_ts"] > keep["start_ts"]:
                db.sessions.update_one(
                    {"_id": demo["_id"]},
                    {"$set": {"status": "cancelled", "cancel_reason": "Duplicate demo session"}},
                )
                print(f"Cancelled overlapping demo session {demo['_id']} (overlaps with {keep['_id']})")
                changes += 1
            else:
                keep = demo
    
    if changes == 0:
        print("No session repairs needed.")
    else:
        print(f"Fixed {changes} sessions.")


if __name__ == "__main__":
    repair_sessions()