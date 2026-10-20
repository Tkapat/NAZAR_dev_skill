from datetime import datetime, timedelta, timezone
from bson import Binary
from app.db.mongo import db

TTL = {"live": 1, "routine": 14, "flag": 90, "reference": 365}

def save_blob(_id: str, centre_id, jpeg: bytes, kind: str, session_id=None, camera_id=None):
    now = datetime.now(timezone.utc)
    doc = {
        "_id": _id,
        "centre_id": centre_id,
        "session_id": session_id,
        "camera_id": camera_id,
        "kind": kind,
        "data": Binary(jpeg),
        "created_at": datetime.now(timezone.utc),
        "expire_at": datetime.now(timezone.utc) + timedelta(days=TTL[kind]),
    }
    db.evidence_blobs.replace_one({"_id": _id}, doc, upsert=True)
    return _id