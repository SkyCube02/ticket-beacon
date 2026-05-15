from datetime import datetime, timezone, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

MANAGER_ROLES = {"TEAM_MANAGER", "SYSTEM_ADMIN"}
STAFF_ROLES = {"AGENT", "SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN"}

# ── England & Wales bank holidays 2024–2027 ───────────────────────────────────

BANK_HOLIDAYS = [
    # 2024
    {"date": "2024-01-01", "name": "New Year's Day"},
    {"date": "2024-03-29", "name": "Good Friday"},
    {"date": "2024-04-01", "name": "Easter Monday"},
    {"date": "2024-05-06", "name": "Early May bank holiday"},
    {"date": "2024-05-27", "name": "Spring bank holiday"},
    {"date": "2024-08-26", "name": "Summer bank holiday"},
    {"date": "2024-12-25", "name": "Christmas Day"},
    {"date": "2024-12-26", "name": "Boxing Day"},
    # 2025
    {"date": "2025-01-01", "name": "New Year's Day"},
    {"date": "2025-04-18", "name": "Good Friday"},
    {"date": "2025-04-21", "name": "Easter Monday"},
    {"date": "2025-05-05", "name": "Early May bank holiday"},
    {"date": "2025-05-26", "name": "Spring bank holiday"},
    {"date": "2025-08-25", "name": "Summer bank holiday"},
    {"date": "2025-12-25", "name": "Christmas Day"},
    {"date": "2025-12-26", "name": "Boxing Day"},
    # 2026
    {"date": "2026-01-01", "name": "New Year's Day"},
    {"date": "2026-04-03", "name": "Good Friday"},
    {"date": "2026-04-06", "name": "Easter Monday"},
    {"date": "2026-05-04", "name": "Early May bank holiday"},
    {"date": "2026-05-25", "name": "Spring bank holiday"},
    {"date": "2026-08-31", "name": "Summer bank holiday"},
    {"date": "2026-12-25", "name": "Christmas Day"},
    {"date": "2026-12-28", "name": "Boxing Day (substitute)"},
    # 2027
    {"date": "2027-01-01", "name": "New Year's Day"},
    {"date": "2027-03-26", "name": "Good Friday"},
    {"date": "2027-03-29", "name": "Easter Monday"},
    {"date": "2027-05-03", "name": "Early May bank holiday"},
    {"date": "2027-05-31", "name": "Spring bank holiday"},
    {"date": "2027-08-30", "name": "Summer bank holiday"},
    {"date": "2027-12-27", "name": "Christmas Day (substitute)"},
    {"date": "2027-12-28", "name": "Boxing Day (substitute)"},
]


def _session_out(s: models.WorkSession) -> dict:
    breaks = s.breaks or []
    break_mins = sum(
        int((datetime.fromisoformat(b["end"]) - datetime.fromisoformat(b["start"])).total_seconds() / 60)
        for b in breaks if b.get("end")
    )
    total_mins = None
    if s.clock_out:
        total_mins = int((s.clock_out - s.clock_in).total_seconds() / 60) - break_mins
    on_break = bool(breaks and not breaks[-1].get("end"))
    return {
        "id": s.id,
        "user_id": s.user_id,
        "user_name": s.user.full_name if s.user else None,
        "date": s.date,
        "clock_in": s.clock_in.isoformat(),
        "clock_out": s.clock_out.isoformat() if s.clock_out else None,
        "breaks": breaks,
        "break_minutes": break_mins,
        "total_minutes": total_mins,
        "on_break": on_break,
        "notes": s.notes,
    }


def _meeting_out(m: models.CalendarMeeting) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "description": m.description,
        "start_time": m.start_time.isoformat(),
        "end_time": m.end_time.isoformat(),
        "attendee_ids": m.attendee_ids or [],
        "teams_link": m.teams_link,
        "created_by_id": m.created_by_id,
        "created_by": m.created_by.full_name if m.created_by else None,
        "source": m.source,
    }


# ── Bank holidays ─────────────────────────────────────────────────────────────

@router.get("/bank-holidays")
def bank_holidays(_: models.User = Depends(get_current_user)):
    return BANK_HOLIDAYS


# ── Clock in / out / break ────────────────────────────────────────────────────

@router.get("/clock/status")
def clock_status(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today().isoformat()
    session = (
        db.query(models.WorkSession)
        .filter(models.WorkSession.user_id == current_user.id, models.WorkSession.date == today)
        .first()
    )
    if not session:
        return {"status": "not_clocked_in", "session": None}
    out = _session_out(session)
    if session.clock_out:
        status = "clocked_out"
    elif out["on_break"]:
        status = "on_break"
    else:
        status = "clocked_in"
    return {"status": status, "session": out}


@router.post("/clock/in")
def clock_in(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today().isoformat()
    existing = (
        db.query(models.WorkSession)
        .filter(models.WorkSession.user_id == current_user.id, models.WorkSession.date == today)
        .first()
    )
    if existing and not existing.clock_out:
        raise HTTPException(status_code=400, detail="Already clocked in today")
    now = datetime.now(timezone.utc)
    session = models.WorkSession(user_id=current_user.id, date=today, clock_in=now, breaks=[])
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_out(session)


@router.post("/clock/out")
def clock_out(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today().isoformat()
    session = (
        db.query(models.WorkSession)
        .filter(models.WorkSession.user_id == current_user.id, models.WorkSession.date == today, models.WorkSession.clock_out == None)
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="Not clocked in")
    now = datetime.now(timezone.utc)
    # Close any open break
    breaks = list(session.breaks or [])
    if breaks and not breaks[-1].get("end"):
        breaks[-1]["end"] = now.isoformat()
        session.breaks = breaks
    session.clock_out = now
    db.commit()
    db.refresh(session)
    return _session_out(session)


@router.post("/clock/break/start")
def break_start(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today().isoformat()
    session = (
        db.query(models.WorkSession)
        .filter(models.WorkSession.user_id == current_user.id, models.WorkSession.date == today, models.WorkSession.clock_out == None)
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="Not clocked in")
    breaks = list(session.breaks or [])
    if breaks and not breaks[-1].get("end"):
        raise HTTPException(status_code=400, detail="Already on break")
    breaks.append({"start": datetime.now(timezone.utc).isoformat(), "end": None})
    session.breaks = breaks
    db.commit()
    db.refresh(session)
    return _session_out(session)


@router.post("/clock/break/end")
def break_end(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today().isoformat()
    session = (
        db.query(models.WorkSession)
        .filter(models.WorkSession.user_id == current_user.id, models.WorkSession.date == today, models.WorkSession.clock_out == None)
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="Not clocked in")
    breaks = list(session.breaks or [])
    if not breaks or breaks[-1].get("end"):
        raise HTTPException(status_code=400, detail="Not on break")
    breaks[-1]["end"] = datetime.now(timezone.utc).isoformat()
    session.breaks = breaks
    db.commit()
    db.refresh(session)
    return _session_out(session)


# ── Work session history ──────────────────────────────────────────────────────

@router.get("/clock/history")
def clock_history(
    start: str = Query(...),  # YYYY-MM-DD
    end: str = Query(...),
    user_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    target_id = current_user.id
    if user_id and user_id != current_user.id:
        if current_user.role not in MANAGER_ROLES:
            raise HTTPException(status_code=403, detail="Managers only")
        target_id = user_id

    sessions = (
        db.query(models.WorkSession)
        .filter(
            models.WorkSession.user_id == target_id,
            models.WorkSession.date >= start,
            models.WorkSession.date <= end,
        )
        .order_by(models.WorkSession.date)
        .all()
    )
    return [_session_out(s) for s in sessions]


@router.get("/clock/team/range")
def team_clock_range(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Managers only")
    sessions = (
        db.query(models.WorkSession)
        .filter(
            models.WorkSession.date >= start,
            models.WorkSession.date <= end,
        )
        .order_by(models.WorkSession.date)
        .all()
    )
    return [_session_out(s) for s in sessions]


@router.get("/clock/team")
def team_clock(
    date_str: str = Query(..., alias="date"),  # YYYY-MM-DD
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Managers only")
    sessions = (
        db.query(models.WorkSession)
        .filter(models.WorkSession.date == date_str)
        .all()
    )
    return [_session_out(s) for s in sessions]


# ── Meetings ──────────────────────────────────────────────────────────────────

class MeetingBody(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: str  # ISO
    end_time: str
    attendee_ids: list[str] = []
    teams_link: Optional[str] = None


@router.get("/meetings")
def list_meetings(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
    meetings = (
        db.query(models.CalendarMeeting)
        .filter(
            models.CalendarMeeting.start_time >= start_dt,
            models.CalendarMeeting.start_time <= end_dt,
        )
        .order_by(models.CalendarMeeting.start_time)
        .all()
    )
    uid = current_user.id
    # Return meetings where user is creator or attendee (or manager sees all)
    result = []
    for m in meetings:
        if (current_user.role in MANAGER_ROLES or
                m.created_by_id == uid or
                uid in (m.attendee_ids or [])):
            result.append(_meeting_out(m))
    return result


@router.post("/meetings", status_code=201)
def create_meeting(
    body: MeetingBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    start_dt = datetime.fromisoformat(body.start_time).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(body.end_time).replace(tzinfo=timezone.utc)
    if end_dt <= start_dt:
        raise HTTPException(status_code=422, detail="End time must be after start time")
    m = models.CalendarMeeting(
        title=body.title,
        description=body.description,
        start_time=start_dt,
        end_time=end_dt,
        attendee_ids=body.attendee_ids,
        teams_link=body.teams_link,
        created_by_id=current_user.id,
        source="internal",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _meeting_out(m)


@router.delete("/meetings/{meeting_id}")
def delete_meeting(
    meeting_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    m = db.query(models.CalendarMeeting).filter(models.CalendarMeeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if m.created_by_id != current_user.id and current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Not authorised")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ── Outlook iCal sync ─────────────────────────────────────────────────────────

@router.post("/meetings/sync-ical")
def sync_ical(
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ical_url = body.get("url", "").strip()
    if not ical_url:
        raise HTTPException(status_code=422, detail="No iCal URL provided")

    try:
        import httpx
        resp = httpx.get(ical_url, timeout=10, follow_redirects=True)
        resp.raise_for_status()
        raw = resp.text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not fetch iCal feed: {e}")

    imported, skipped = 0, 0
    for block in raw.split("BEGIN:VEVENT"):
        if "END:VEVENT" not in block:
            continue

        def _field(name):
            for line in block.splitlines():
                if line.startswith(name + ":") or line.startswith(name + ";"):
                    return line.split(":", 1)[-1].strip()
            return ""

        uid = _field("UID")
        summary = _field("SUMMARY") or "Untitled"
        dtstart = _field("DTSTART")
        dtend = _field("DTEND")
        url = _field("URL")

        if not uid or not dtstart:
            skipped += 1
            continue

        def _parse_dt(s):
            # Strip timezone suffix — we treat all times as UTC
            s = s.strip().rstrip("Z")
            if "+" in s[8:]:  # e.g. 20250513T120000+01:00
                s = s[:s.index("+", 8)]
            for fmt, length in [("%Y%m%dT%H%M%S", 15), ("%Y%m%d", 8)]:
                try:
                    return datetime.strptime(s[:length], fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
            return None

        start_dt = _parse_dt(dtstart)
        end_dt = _parse_dt(dtend) if dtend else (start_dt + timedelta(hours=1) if start_dt else None)

        if not start_dt or not end_dt:
            skipped += 1
            continue

        existing = db.query(models.CalendarMeeting).filter(
            models.CalendarMeeting.external_uid == uid
        ).first()
        if existing:
            existing.title = summary
            existing.start_time = start_dt
            existing.end_time = end_dt
            existing.teams_link = url or existing.teams_link
            skipped += 1
        else:
            db.add(models.CalendarMeeting(
                title=summary,
                start_time=start_dt,
                end_time=end_dt,
                teams_link=url or None,
                created_by_id=current_user.id,
                source="outlook",
                external_uid=uid,
                attendee_ids=[current_user.id],
            ))
            imported += 1

    db.commit()
    return {"imported": imported, "updated": skipped}


# ── Task due dates for calendar ──────────────────────────────────────────────

@router.get("/task-events")
def task_events_cal(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Task).filter(
        models.Task.due_date.isnot(None),
        models.Task.due_date >= start,
        models.Task.due_date <= end,
    )
    if current_user.role not in MANAGER_ROLES:
        q = q.filter(models.Task.assignee_id == current_user.id)
    return [{
        "id": t.id,
        "title": t.title,
        "status": t.status,
        "due_date": t.due_date,
        "assignee": t.assignee.full_name if t.assignee else None,
        "assignee_id": t.assignee_id,
        "linked_ticket_id": t.linked_ticket_id,
    } for t in q.all()]


# ── Ticket completions for calendar ──────────────────────────────────────────

@router.get("/ticket-events")
def ticket_events(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
    end_dt = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)

    q = db.query(models.Ticket).filter(
        models.Ticket.resolved_at >= start_dt,
        models.Ticket.resolved_at <= end_dt,
    )
    if current_user.role not in MANAGER_ROLES:
        q = q.filter(models.Ticket.assignee_id == current_user.id)

    tickets = q.all()
    events = []
    for t in tickets:
        duration = None
        if t.resolved_at and t.created_at:
            duration = int((t.resolved_at - t.created_at).total_seconds() / 60)
        events.append({
            "id": t.id,
            "ticket_number": t.ticket_number,
            "title": t.title,
            "priority": t.priority,
            "resolved_at": t.resolved_at.isoformat(),
            "assignee": t.assignee.full_name if t.assignee else None,
            "duration_minutes": duration,
        })
    return events
