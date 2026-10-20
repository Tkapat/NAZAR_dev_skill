from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.audit import audit
from app.core.deps import require
from app.core.limiter import limiter
from app.db.mongo import db, oid, ser

router = APIRouter()


@router.get("/centres/{cid}/equipment")
@limiter.limit("100/minute")
def list_equipment(
    request: Request, cid: str, user=Depends(require("super_admin", "scheme_officer", "auditor"))
):
    centre = db.centres.find_one({"_id": oid(cid)})
    if not centre:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})
    rules = tpl.get("equipment_rules", []) if tpl else []
    eq_map = {e["class"]: e for e in centre.get("equipment", [])}
    out = []
    classes_handled = set()
    for e in centre.get("equipment", []):
        r = next((rule for rule in rules if rule["class"] == e["class"]), {})
        classes_handled.add(e["class"])
        sanctioned = e.get("sanctioned_qty")
        if sanctioned is None or sanctioned == 0:
            sanctioned = int(round(r.get("min_units_per_trainee", 1) * centre.get("max_trainees", 20)))
        out.append(
            {
                "class": e["class"],
                "label": e.get("label", r.get("label", e["class"])),
                "sanctioned": sanctioned,
                "declared": e.get("declared_qty", 0),
                "observed": None,
                "operability": r.get("operability", "none"),
                "required": r.get("required", False),
            }
        )
    for r in rules:
        if r["class"] not in classes_handled:
            out.append(
                {
                    "class": r["class"],
                    "label": r["label"],
                    "sanctioned": int(round(r.get("min_units_per_trainee", 1) * centre.get("max_trainees", 20))),
                    "declared": 0,
                    "observed": None,
                    "operability": r.get("operability", "none"),
                    "required": r.get("required", False),
                }
            )
    return ser(out)


@router.get("/my/equipment")
@limiter.limit("100/minute")
def list_my_equipment(request: Request, user=Depends(require("centre_admin", "trainer"))):
    cid = user["centre_id"]
    centre = db.centres.find_one({"_id": cid})
    if not centre:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    tpl = db.trade_templates.find_one({"_id": centre["trade_template_id"]})
    rules = {r["class"]: r for r in (tpl.get("equipment_rules", []) if tpl else [])}
    latest = list(
        db.observations.find(
            {"centre_id": cid, "equipment": {"$ne": None}}
        )
        .sort("_id", -1)
        .limit(1)
    )
    obs_eq = latest[0].get("equipment", {}) if latest else {}
    obs_at = latest[0].get("created_at") or (latest[0].get("hour_bucket") if latest else None)
    repairs: dict[str, list] = {}
    for r in db.repair_declarations.find(
        {"centre_id": cid, "status": {"$in": ["pending", "approved"]}}
    ):
        repairs.setdefault(r["equipment_class"], []).append(r)

    out = []
    for e in centre.get("equipment", []):
        rule = rules.get(e["class"], {})
        o = obs_eq.get(e["class"]) or {}
        observed = o.get("observed")
        declared = e.get("declared_qty", 0)
        pending_repair = any(r["status"] == "pending" for r in repairs.get(e["class"], []))
        approved_repair = any(r["status"] == "approved" for r in repairs.get(e["class"], []))
        if approved_repair:
            status = "repair_approved"
        elif observed is None:
            status = "unknown"
        elif observed == 0:
            status = "idle"
        elif declared and observed < declared:
            status = "missing"
        else:
            status = "ok"
        out.append(
            {
                "class": e["class"],
                "label": e.get("label", e["class"]),
                "sanctioned_qty": e.get("sanctioned_qty", 0),
                "declared_qty": declared,
                "required": rule.get("required", False),
                "operability": rule.get("operability", "none"),
                "observed": observed,
                "observed_at": obs_at,
                "observed_status": status,
                "repair_pending": pending_repair,
                "repair_approved": approved_repair,
                "repairs": repairs.get(e["class"], []),
            }
        )
    return ser(out)


@router.put("/my/equipment")
@limiter.limit("30/minute")
def update_declared_equipment(request: Request, body: dict, user=Depends(require("centre_admin"))):
    cid = user["centre_id"]
    centre = db.centres.find_one({"_id": cid})
    if not centre:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    if centre["status"] in ("suspended", "terminated"):
        raise HTTPException(403, detail={"detail": "Centre not active", "code": "CENTRE_INACTIVE"})

    equipment = body.get("equipment", [])
    for e in equipment:
        db.centres.update_one(
            {"_id": cid, "equipment.class": e["class"]},
            {
                "$set": {
                    "equipment.$.declared_qty": e["declared_qty"],
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
    audit(user, "equipment.update_declared", "centre", cid, {"equipment": equipment})
    return {"ok": True}
