from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import require
from app.db.mongo import db, oid
from app.services import calendar

router = APIRouter()
IST = ZoneInfo("Asia/Kolkata")
GOVT_READ = ("super_admin", "scheme_officer", "auditor")


def _parse_range(d_from: str, d_to: str) -> None:
    if not d_from or not d_to:
        raise HTTPException(422, detail={"detail": "from and to required", "code": "BAD_RANGE"})
    d1, d2 = date.fromisoformat(d_from), date.fromisoformat(d_to)
    if d1 > d2:
        raise HTTPException(422, detail={"detail": "from > to", "code": "BAD_RANGE"})
    if (d2 - d1).days > 400:
        raise HTTPException(422, detail={"detail": "Range too large (max 400 days)", "code": "RANGE_TOO_LARGE"})


def _govt_centre_access(cid, user):
    c = db.centres.find_one({"_id": oid(cid)})
    if not c:
        raise HTTPException(404, detail={"detail": "Not found", "code": "NOT_FOUND"})
    return c


# ---- centre routes ----
@router.get("/my/calendar")
def my_calendar_range(
    from_: str = Query(None, alias="from"),
    to: str = Query(None, alias="to"),
    user=Depends(require("centre_admin", "trainer")),
):
    today = datetime.now(IST).date()
    d_to = to or today.isoformat()
    d_from = from_ or (today - timedelta(days=29)).isoformat()
    _parse_range(d_from, d_to)
    return {"items": calendar.calendar_range(user["centre_id"], d_from, d_to)}


@router.get("/my/calendar/{date}")
def my_day_detail(date: str, user=Depends(require("centre_admin", "trainer"))):
    return calendar.day_detail(user["centre_id"], date)


@router.get("/my/calendar/{date}/snapshots")
def my_day_snapshots(
    date: str,
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user=Depends(require("centre_admin", "trainer")),
):
    return calendar.day_snapshots(user["centre_id"], date, limit, cursor)


# ---- govt routes ----
@router.get("/centres/{cid}/calendar")
def centre_calendar(
    cid: str,
    from_: str = Query(None, alias="from"),
    to: str = Query(None, alias="to"),
    user=Depends(require(*GOVT_READ)),
):
    c = _govt_centre_access(cid, user)
    today = datetime.now(IST).date()
    d_to = to or today.isoformat()
    d_from = from_ or (today - timedelta(days=29)).isoformat()
    _parse_range(d_from, d_to)
    return {"items": calendar.calendar_range(c["_id"], d_from, d_to)}


@router.get("/centres/{cid}/calendar/{date}")
def centre_day(cid: str, date: str, user=Depends(require(*GOVT_READ))):
    c = _govt_centre_access(cid, user)
    return calendar.day_detail(c["_id"], date)


@router.get("/centres/{cid}/calendar/{date}/snapshots")
def centre_day_snapshots(
    cid: str,
    date: str,
    limit: int = Query(25, le=100),
    cursor: str | None = None,
    user=Depends(require(*GOVT_READ)),
):
    c = _govt_centre_access(cid, user)
    return calendar.day_snapshots(c["_id"], date, limit, cursor)
