"""Create/refresh the demo centre for the centre portal (idempotent).

Centre ID : DSK-WB-0001   "Sunrise Skill Centre" (Howrah, West Bengal)
Admin     : dsk-wb-0001       / devskillcentre    (centre_admin)
Trainer   : dsk-wb-0001-t01   / devskilltrainer   (trainer, face enrolled)

Seeds: centre (live by default), admin+trainer logins, staff row with face,
two batches + sessions for today..+14d, 30 trainees, one approved camera
with ROI + reference frame, declared equipment, and a claim on yesterday's
session so the attendance history is not empty.

Run from the backend root:
    python -m scripts.set_demo_centre            # live centre
    python -m scripts.set_demo_centre --pending  # pending_setup (onboarding demo)
"""

import argparse
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np
from bson import Binary

from app.db.mongo import db
from app.services.credentials import create_login
from app.services.dbfuncs import generate_sessions
from app.services.face import embed, encrypt

CODE = "DSK-WB-0001"
CENTRE_NAME = "Sunrise Skill Centre"
ADMIN_LOGIN = CODE.lower()
ADMIN_PWD = "devskillcentre"
TRAINER_LOGIN = f"{CODE}-T01".lower()
TRAINER_PWD = "devskilltrainer"
TRAINER_NAME = "Anita Sharma"
BATCH_A = "Morning Lab"
BATCH_B = "Afternoon Lab"
TRADE = "Computer Lab (Basic IT)"
ROI = [[0.02, 0.05], [0.98, 0.05], [0.98, 0.95], [0.02, 0.95]]
VIDEO = "sample_videos/lab_normal.mp4"
FACE_IMG = "sample_videos/_src/face.jpg"

NAMES = [
    "Aarav Mehta", "Diya Sen", "Ishaan Roy", "Kabir Das", "Meera Iyer",
    "Neel Chatterjee", "Priya Nair", "Rohan Gupta", "Sanya Kapoor", "Tanvi Bose",
    "Aditya Ghosh", "Ananya Dutta", "Arjun Pal", "Dev Malhotra", "Ira Verma",
    "Jai Kulkarni", "Kia Banerjee", "Manav Shah", "Naina Joshi", "Om Prakash",
    "Pihu Rane", "Rehan Qureshi", "Sara Dey", "Uday Naik", "Vaani Rao",
    "Yash Ahuja", "Zoya Khan", "Aryan Mishra", "Kyra Singh", "Nikhil Barman",
]


def _ensure_reference(centre_id) -> dict:
    """Store frame 0 of the sample video as the camera reference frame."""
    cap = cv2.VideoCapture(VIDEO)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise SystemExit(f"Cannot read {VIDEO} (run python -m scripts.make_sample_videos first)")
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mask = np.zeros(gray.shape, np.uint8)
    h, w = gray.shape
    cv2.fillPoly(mask, [np.array([[int(x * w), int(y * h)] for x, y in ROI], np.int32)], 255)
    _ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not _ok:
        raise SystemExit("JPEG encode failed")
    eid = f"ref-{CODE.lower()}"
    db.evidence_blobs.replace_one(
        {"_id": eid},
        {
            "_id": eid,
            "centre_id": centre_id,
            "kind": "reference",
            "data": Binary(buf.tobytes()),
            "created_at": datetime.now(timezone.utc),
            "expire_at": datetime.now(timezone.utc) + timedelta(days=365),
        },
        upsert=True,
    )
    return {
        "reference_blob_id": eid,
        "reference_width": w,
        "reference_height": h,
        "reference_quality": {
            "brightness": round(float(gray.mean()), 1),
            "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 1),
            "coverage": round(float(mask.mean() / 255), 3),
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--pending", action="store_true", help="seed as pending_setup (onboarding demo)"
    )
    args = ap.parse_args()

    scheme = db.schemes.find_one({"code": "DEMO-SDS"})
    tpl = (
        db.trade_templates.find_one({"scheme_id": scheme["_id"], "trade_name": TRADE})
        if scheme
        else None
    )
    if not tpl:
        raise SystemExit("Run scripts/init_db.py first (scheme/templates missing).")
    now = datetime.now(timezone.utc)
    status = "pending_setup" if args.pending else "live"

    # ---- centre ----
    centre = db.centres.find_one({"code": CODE})
    if not centre:
        centre = {
            "code": CODE,
            "name": CENTRE_NAME,
            "max_trainees": 40,
            "enrolled_count": 0,
            "status": status,
            "application_id": None,
            "created_by_govt": False,
            "created_at": now,
        }
        centre["_id"] = db.centres.insert_one(centre).inserted_id
    cid = centre["_id"]
    db.centres.update_one(
        {"_id": cid},
        {
            "$set": {
                "name": CENTRE_NAME,
                "scheme_id": scheme["_id"],
                "trade_template_id": tpl["_id"],
                "max_trainees": 40,
                "address": "12, G T Road, Howrah",
                "district": "Howrah",
                "state": "West Bengal",
                "lat": 22.5958,
                "lng": 88.2636,
                "contact_phone": "+919830000001",
                "contact_email": "sunrise@example.org",
                "equipment": [
                    {"class": "monitor", "label": "Monitor", "sanctioned_qty": 40, "declared_qty": 40},
                    {"class": "chair", "label": "Chair", "sanctioned_qty": 40, "declared_qty": 40},
                    {"class": "desk", "label": "Desk", "sanctioned_qty": 30, "declared_qty": 30},
                ],
                "status": status,
                "risk_score": 0,
                "updated_at": now,
            },
            "$setOnInsert": {"live_since": now if status == "live" else None},
        },
    )

    # ---- logins ----
    if not db.users.find_one({"login_id": ADMIN_LOGIN}):
        create_login(
            ADMIN_LOGIN, ADMIN_PWD, "centre_admin", cid,
            CENTRE_NAME + " Admin", "+919830000001",
        )
    db.users.update_one(
        {"login_id": ADMIN_LOGIN},
        {
            "$set": {
                "must_change_password": False,
                "temp_password_expires_at": None,
                "active": True,
                "token_version": 0,
            }
        },
    )
    if not db.users.find_one({"login_id": TRAINER_LOGIN}):
        create_login(TRAINER_LOGIN, TRAINER_PWD, "trainer", cid, TRAINER_NAME, "+919830000002")
    db.users.update_one(
        {"login_id": TRAINER_LOGIN},
        {
            "$set": {
                "must_change_password": False,
                "temp_password_expires_at": None,
                "active": True,
                "token_version": 0,
            }
        },
    )
    trainer_user = db.users.find_one({"login_id": TRAINER_LOGIN})

    # ---- staff + face ----
    staff = db.staff.find_one({"user_id": trainer_user["_id"]})
    if not staff:
        staff = {
            "centre_id": cid,
            "full_name": TRAINER_NAME,
            "staff_role": "trainer",
            "phone": "+919830000002",
            "face_consent": False,
            "face_enrolled": False,
            "active": True,
            "created_at": now,
            "user_id": trainer_user["_id"],
        }
        staff["_id"] = db.staff.insert_one(staff).inserted_id
    try:
        img = cv2.imread(FACE_IMG)
        e = embed(img) if img is not None else None
        if e is not None:
            db.staff_faces.update_one(
                {"_id": staff["_id"]},
                {"$set": {"embedding_enc": encrypt(e), "model": "buffalo_s", "created_at": now}},
                upsert=True,
            )
            db.staff.update_one(
                {"_id": staff["_id"]},
                {"$set": {"face_consent": True, "face_consent_at": now, "face_enrolled": True}},
            )
            print("trainer face enrolled")
    except Exception as exc:
        print(f"face enrolment skipped: {exc}")

    # ---- batches + sessions ----
    def upsert_batch(name, weekdays, st, et):
        b = db.batches.find_one({"centre_id": cid, "name": name})
        row = {
            "centre_id": cid, "name": name, "trainer_id": staff["_id"],
            "weekdays": weekdays, "start_time": st, "end_time": et,
            "start_date": None, "end_date": None, "active": True, "created_at": now,
        }
        if b:
            db.batches.update_one({"_id": b["_id"]}, {"$set": row})
            return b["_id"]
        return db.batches.insert_one(row).inserted_id

    bid_a = upsert_batch(BATCH_A, [1, 2, 3, 4, 5, 6, 7], "09:30", "11:30")
    bid_b = upsert_batch(BATCH_B, [2, 4, 6], "14:00", "16:00")
    today = now.date()
    generate_sessions(cid, today - timedelta(days=1), today + timedelta(days=14))

    # ---- trainees (18 in morning batch, 12 in afternoon) ----
    if db.trainees.count_documents({"centre_id": cid}) == 0:
        db.trainees.insert_many(
            [
                {
                    "centre_id": cid,
                    "batch_id": None,
                    "full_name": n,
                    "external_id": f"{CODE}-TR-{i:03d}",
                    "active": True,
                    "created_at": now,
                }
                for i, n in enumerate(NAMES, 1)
            ]
        )
    for i, t in enumerate(db.trainees.find({"centre_id": cid}).sort("_id", 1)):
        want = bid_a if i < 18 else bid_b
        if t.get("batch_id") != want:
            db.trainees.update_one({"_id": t["_id"]}, {"$set": {"batch_id": want}})
    db.centres.update_one(
        {"_id": cid},
        {
            "$set": {
                "enrolled_count": db.trainees.count_documents(
                    {"centre_id": cid, "active": True}
                )
            }
        },
    )

    # ---- camera (approved when live, draft with ROI when pending) ----
    cam = db.cameras.find_one({"centre_id": cid, "name": "Lab 101"})
    cam_row = {
        "centre_id": cid,
        "name": "Lab 101",
        "source_uri": "browser",
        "source_kind": "browser",
        "live": {"enabled": True, "interval_s": 10, "tiling": False},
        "subtract_staff": True,
        "zone_label": "Lab 101",
        "resolution": "1280x720",
        "roi_polygon": ROI,
        "zones": None,
        "setup_status": "draft" if args.pending else "approved",
        "status": "online",
        "last_seen": now,
        "created_at": now,
        **(_ensure_reference(cid) if status == "live" else {}),
    }
    if args.pending:
        cam_row.update(_ensure_reference(cid))
    if cam:
        db.cameras.update_one({"_id": cam["_id"]}, {"$set": cam_row})
    else:
        db.cameras.insert_one(cam_row)

    # ---- claim on yesterday's morning session (attendance history) ----
    yst = (today - timedelta(days=1)).isoformat()
    s = db.sessions.find_one({"centre_id": cid, "session_date": yst, "batch_id": bid_a})
    if s:
        ids = [
            t["_id"]
            for t in db.trainees.find(
                {"centre_id": cid, "batch_id": bid_a, "active": True}
            ).limit(17)
        ]
        db.attendance_claims.update_one(
            {"session_id": s["_id"]},
            {
                "$set": {
                    "session_id": s["_id"],
                    "centre_id": cid,
                    "claimed_count": len(ids),
                    "present_trainee_ids": ids,
                    "marked_by": trainer_user["_id"],
                    "edit_reason": None,
                }
            },
            upsert=True,
        )

    print(
        f"Demo centre ready: {CODE}  admin={ADMIN_LOGIN}/{ADMIN_PWD}  "
        f"trainer={TRAINER_LOGIN}/{TRAINER_PWD}  status={status}"
    )


if __name__ == "__main__":
    main()
