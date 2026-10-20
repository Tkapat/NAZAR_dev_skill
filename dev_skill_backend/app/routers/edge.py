import glob
import hashlib
import os
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import require
from app.core.limiter import limiter
from app.db.mongo import db, oid, ser, sign_file_url
from app.routers.files import save_evidence
from app.services.dbfuncs import recompute_risk
from app.services.flag_engine import evaluate
from app.services.ledger import append
from app.services.pipeline import analyse_hour
from app.services.sync import STATE, sync_tick, unsynced_count
from app.services.vision.detector import Detector

router = APIRouter()


@router.get("/edge/videos")
@limiter.limit("100/minute")
def list_videos(request: Request, user=Depends(require("centre_admin", "super_admin"))):
    vids = []
    for f in glob.glob("sample_videos/*.mp4"):
        vids.append(os.path.basename(f))
    return {"videos": vids}


@router.post("/edge/demo/run")
@limiter.limit("30/minute")
def run_demo(request: Request, body: dict, user=Depends(require("centre_admin", "super_admin"))):
    camera_id = body["camera_id"]
    session_id = body["session_id"]
    video_name = body["video"]
    _ = body.get("scenario", "normal")  # reserved for future use
    claimed_override = body.get("claimed_override")

    cam = db.cameras.find_one({"_id": oid(camera_id)})
    if not cam:
        raise HTTPException(404, detail={"detail": "Camera not found", "code": "NOT_FOUND"})
    if str(cam["centre_id"]) != str(user["centre_id"]) and user["role"] != "super_admin":
        raise HTTPException(403, detail={"detail": "Not your centre", "code": "WRONG_CENTRE"})

    centre = db.centres.find_one({"_id": cam["centre_id"]})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})
    session = db.sessions.find_one({"_id": oid(session_id)})
    if not session:
        raise HTTPException(404, detail={"detail": "Session not found", "code": "NOT_FOUND"})

    staff_verified = (
        db.staff_attendance.count_documents({"session_id": oid(session_id), "verified": True}) > 0
    )
    staff_subtract = 0 if staff_verified else 1

    detector = Detector(tpl["detector_classes"], float(tpl["min_confidence"]), backend=tpl.get("detector_backend", "auto"))
    video_path = f"sample_videos/{video_name}"
    if not os.path.exists(video_path):
        raise HTTPException(404, detail={"detail": "Video not found", "code": "NOT_FOUND"})

    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    def grab_frame():
        frame_idx = int(total_frames * (hash(str(datetime.now(timezone.utc))) % 1000) / 1000)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        return frame if ret else None

    ref_frame = None
    if cam.get("reference_blob_id"):
        d = db.evidence_blobs.find_one({"_id": cam["reference_blob_id"]})
        if d:
            ref_frame = cv2.imdecode(np.frombuffer(d["data"], np.uint8), cv2.IMREAD_COLOR)

    res = analyse_hour(grab_frame, detector, tpl, cam, staff_subtract, ref_frame)
    cap.release()

    claim = db.attendance_claims.find_one({"session_id": oid(session_id)})
    claimed = (
        claimed_override
        if claimed_override is not None
        else (claim.get("claimed_count") if claim else None)
    )

    # Get centre's actual equipment from embedded array (with sanctioned_qty/declared_qty)
    centre_eq = centre.get("equipment", [])
    eq_rules = [
        {
            "class": e["class"],
            "label": e["label"],
            "sanctioned": e["sanctioned_qty"],
            "declared": e["declared_qty"],
            "required": True,
            "operability": e.get("operability", "none"),
        }
        for e in centre_eq
    ]

    ctx = {
        "claimed": claimed,
        "enrolled": db.trainees.count_documents({"centre_id": centre["_id"], "active": True}),
        "sanctioned_max": centre["max_trainees"],
        "tol": tpl["count_tolerance"],
        "obs": res,
        "equipment_rules": eq_rules,
        "repairs": {
            r["equipment_class"]: r["qty"]
            for r in db.repair_declarations.find({"centre_id": centre["_id"], "status": "approved"})
        },
        "repeats": {},
        "trainer_verified": staff_verified,
        "camera_tamper": res["tamper"],
    }
    flags = evaluate(ctx)

    now = datetime.now(timezone.utc)
    thumb_eids = []
    for th in res.get("thumbs", []):
        eid = "thumb-" + hashlib.sha1(th).hexdigest()[:24]
        save_evidence(centre["_id"], th, eid, session_id=session["_id"])
        thumb_eids.append(eid)
    thumb_urls = [sign_file_url("evidence", e) for e in thumb_eids]

    obs_row = {
        "centre_id": centre["_id"],
        "session_id": session["_id"],
        "camera_id": cam["_id"],
        "observed_count": res["observed"],
        "ci_low": res["ci_low"],
        "ci_high": res["ci_high"],
        "frames_used": res["frames_used"],
        "state": res["state"],
        "per_frame": res["per_frame"],
        "equipment": {
            k: {
                "observed": v.get("observed"),
                "ci_low": v.get("ci_low"),
                "ci_high": v.get("ci_high"),
            }
            for k, v in res["equipment"].items()
        },
        "tamper": res["tamper"],
        "hour_bucket": now.replace(minute=0, second=0, microsecond=0),
        "created_at": now,
    }
    ledger_obs = append(
        "observation", {"row": obs_row, "centre_id": str(centre["_id"]), "evidence_local": []}
    )
    obs_row["ledger_hash"] = ledger_obs["hash"]
    obs_row["source"] = "demo"
    prev_obs = db.observations.find_one(
        {"session_id": session["_id"], "camera_id": cam["_id"], "hour_bucket": obs_row["hour_bucket"]}
    )
    if prev_obs:
        obs_id = prev_obs["_id"]
        db.observations.update_one({"_id": obs_id}, {"$set": obs_row})
    else:
        obs_id = db.observations.insert_one(obs_row).inserted_id

    for fl in flags:
        fl["centre_id"] = centre["_id"]
        fl["session_id"] = session["_id"]
        fl["observation_id"] = obs_id
        fl["evidence_ids"] = thumb_eids
        fl["model_version"] = detector.version
        fl["status"] = "open"
        fl["created_at"] = now
        fl["events"] = [{"action": "created", "ts": now}]
        fl["dedupe_key"] = (
            f"{session['_id']}:{fl['type']}"
            + (f":{fl['class']}" if fl.get("class") else "")
        )
        existing = db.flags.find_one({"dedupe_key": fl["dedupe_key"], "status": {"$in": ["open", "acknowledged", "centre_responded", "under_review", "escalated"]}})
        if existing:
            db.flags.update_one(
                {"_id": existing["_id"]},
                {"$set": {"reason": fl["reason"], "severity": fl["severity"], "updated_at": now, "evidence_ids": thumb_eids}},
            )
        else:
            ledger_entry = append(
                "flag", {"row": fl, "centre_id": str(centre["_id"]), "evidence_local": []}
            )
            fl["ledger_hash"] = ledger_entry["hash"]
            db.flags.insert_one(fl)
        recompute_risk(centre["_id"])

    db.cameras.update_one(
        {"_id": cam["_id"]},
        {"$set": {"status": "tampered" if res["tamper"] else "online", "last_seen": now}},
    )

    return {
        "observed": res["observed"],
        "ci_low": res["ci_low"],
        "ci_high": res["ci_high"],
        "state": res["state"],
        "per_frame": res["per_frame"],
        "frames_used": res["frames_used"],
        "claimed": claimed,
        "thumbnails": thumb_urls,
        "flags": ser(flags),
    }


@router.post("/edge/analyze-frame")
@limiter.limit("60/minute")
def analyze_frame(request: Request, body: dict, user=Depends(require("centre_admin", "super_admin"))):
    """Analyze a single frame from webcam - returns person count, equipment detections."""
    image_b64 = body.get("image_b64")
    camera_id = body.get("camera_id")
    if not image_b64 or not camera_id:
        raise HTTPException(422, detail={"detail": "image_b64 and camera_id required", "code": "BAD_REQUEST"})

    cam = db.cameras.find_one({"_id": oid(camera_id)})
    if not cam or str(cam["centre_id"]) != str(user["centre_id"]):
        raise HTTPException(403, detail={"detail": "Not your camera", "code": "FORBIDDEN"})

    centre = db.centres.find_one({"_id": cam["centre_id"]})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})

    # Decode base64 image
    import base64
    img_bytes = base64.b64decode(image_b64.split(",")[-1])
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(422, detail={"detail": "Invalid image", "code": "BAD_IMAGE"})

    # Get reference frame
    ref_frame = None
    if cam.get("reference_blob_id"):
        d = db.evidence_blobs.find_one({"_id": cam["reference_blob_id"]})
        if d:
            ref_frame = cv2.imdecode(np.frombuffer(d["data"], np.uint8), cv2.IMREAD_COLOR)

    # Run detector on single frame
    detector = Detector(tpl["detector_classes"], float(tpl["min_confidence"]), backend=tpl.get("detector_backend", "auto"))
    detections = detector.detect(frame)

    # Count people
    person_count = sum(1 for d in detections if d["class"] == "person")

    # Check equipment
    equipment_rules = tpl.get("equipment_rules", [])
    eq_detections = {}
    for rule in equipment_rules:
        cls = rule["class"]
        count = sum(1 for d in detections if d["class"] == cls)
        eq_detections[cls] = {"detected": count, "required": True, "label": rule["label"]}

    # ROI check if available
    roi_ok = True
    if cam.get("roi_polygon"):
        h, w = frame.shape[:2]
        poly = np.array(cam["roi_polygon"], dtype=np.float32)
        poly[:, 0] *= w
        poly[:, 1] *= h
        poly = poly.astype(np.int32)
        person_in_roi = 0
        for d in detections:
            if d["class"] == "person":
                cx = (d["bbox"][0] + d["bbox"][2]) / 2
                cy = (d["bbox"][1] + d["bbox"][3]) / 2
                if cv2.pointPolygonTest(poly, (cx, cy), False) >= 0:
                    person_in_roi += 1
        person_count = person_in_roi

    return {
        "person_count": person_count,
        "equipment": eq_detections,
        "detections": [{"class": d["class"], "confidence": d["confidence"], "bbox": d["bbox"]} for d in detections],
    }


@router.post("/edge/offline")
@limiter.limit("30/minute")
def set_offline(request: Request, body: dict, user=Depends(require("centre_admin", "super_admin"))):
    val = bool(body.get("value", False))
    STATE["offline"] = val
    if user.get("centre_id"):
        db.cameras.update_many(
            {"centre_id": user["centre_id"]},
            {
                "$set": {
                    "status": "offline" if val else "online",
                    "last_seen": datetime.now(timezone.utc),
                }
            },
        )
    return {"offline": STATE["offline"]}


@router.post("/edge/sync-now")
@limiter.limit("30/minute")
def sync_now(request: Request, user=Depends(require("centre_admin", "super_admin"))):
    return sync_tick(batch=100)


@router.get("/edge/status")
@limiter.limit("100/minute")
def edge_status(request: Request, user=Depends(require("centre_admin", "super_admin"))):
    device = db.edge_devices.find_one({"_id": "edge-001"})
    return {
        "online": not STATE["offline"],
        "unsynced_count": unsynced_count(),
        "last_sync": device.get("last_sync") if device else None,
        "chain_ok": device.get("chain_ok", True) if device else True,
    }
