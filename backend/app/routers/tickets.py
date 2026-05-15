from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

TICKET_STATUSES = [
    "OPEN", "ACKNOWLEDGED", "IN PROGRESS", "PENDING CLIENT",
    "RESOLVED", "CLOSED", "ESCALATED", "SLA BREACHED", "CANCELLED",
]

# Acknowledgement windows in seconds: P1=2min, P2=10min, P3/4/5=30min
SLA_WINDOWS = {"P1": 120, "P2": 600, "P3": 1800, "P4": 1800, "P5": 1800}


def _ticket_number(db: Session) -> str:
    count = db.query(models.Ticket).count()
    return f"TKT-{str(count + 1).zfill(3)}"


def _serialize(ticket: models.Ticket, hide_internal: bool = False) -> dict:
    return {
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "title": ticket.title,
        "description": ticket.description,
        "status": ticket.status,
        "priority": ticket.priority,
        "requester": {
            "name": ticket.requester_name,
            "email": ticket.requester_email,
            "dept": ticket.requester_dept,
        },
        "assignee": ticket.assignee.full_name if ticket.assignee else None,
        "assignee_id": ticket.assignee_id,
        "company_id": ticket.company_id,
        "company_name": ticket.company.name if ticket.company else None,
        "tags": ticket.tags or [],
        "sla_breached": ticket.sla_breached,
        "priority_justification": ticket.priority_justification,
        "priority_pending_approval": ticket.priority_pending_approval,
        "system_info": ticket.system_info,
        "satisfaction_score": ticket.satisfaction_score,
        "satisfaction_note": ticket.satisfaction_note,
        "createdAt": ticket.created_at.isoformat(),
        "updatedAt": ticket.updated_at.isoformat(),
        "acknowledgedAt": ticket.acknowledged_at.isoformat() if ticket.acknowledged_at else None,
        "resolvedAt": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "closedAt": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "logs": [s for l in ticket.logs if (s := _serialize_log(l, hide_internal=hide_internal)) is not None],
        "attachments": [
            {
                "id": a.id,
                "file_name": a.file_name,
                "file_type": a.file_type,
                "file_size_bytes": a.file_size_bytes,
                "uploaded_by": a.uploaded_by.full_name if a.uploaded_by else "Unknown",
                "uploaded_at": a.uploaded_at.isoformat(),
            }
            for a in ticket.attachments
        ],
    }


def _serialize_log(log: models.AuditLog, hide_internal: bool = False) -> dict:
    if hide_internal and log.is_internal:
        return None
    return {
        "id": log.id,
        "actor": log.actor_label,
        "action": log.action,
        "timestamp": log.timestamp.isoformat(),
        "meta": log.meta or {},
        "is_internal": log.is_internal,
    }


def _add_log(db: Session, ticket_id: str, actor_label: str, action: str, actor_id: Optional[str] = None, meta: dict = {}):
    log = models.AuditLog(
        ticket_id=ticket_id,
        actor_id=actor_id,
        actor_label=actor_label,
        action=action,
        meta=meta,
    )
    db.add(log)


# ── List tickets ──────────────────────────────────────────────────────────────

@router.get("")
def list_tickets(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    company_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Ticket)

    if current_user.role == "CLIENT_USER":
        q = q.filter(models.Ticket.requester_email == current_user.email)
    elif current_user.role == "CLIENT_MANAGER":
        assigned_ids = [c.id for c in current_user.companies]
        q = q.filter(models.Ticket.company_id.in_(assigned_ids))
    elif current_user.role != "SYSTEM_ADMIN":
        assigned_ids = [c.id for c in current_user.companies]
        q = q.filter(models.Ticket.company_id.in_(assigned_ids))

    if company_id:
        q = q.filter(models.Ticket.company_id == company_id)
    if status:
        q = q.filter(models.Ticket.status == status)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(
            models.Ticket.title.ilike(term) |
            models.Ticket.ticket_number.ilike(term) |
            models.Ticket.requester_name.ilike(term)
        )
    is_client = current_user.role in ("CLIENT_USER", "CLIENT_MANAGER")
    tickets = q.order_by(models.Ticket.created_at.desc()).all()
    return [_serialize(t, hide_internal=is_client) for t in tickets]


# ── Get single ticket ─────────────────────────────────────────────────────────

@router.get("/{ticket_id}")
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    is_client = current_user.role in ("CLIENT_USER", "CLIENT_MANAGER")
    return _serialize(ticket, hide_internal=is_client)


# ── Create ticket ─────────────────────────────────────────────────────────────

class CreateTicketBody(BaseModel):
    title: str
    description: str = ""
    priority: str = "P3"
    priority_justification: Optional[str] = None
    requester_name: str
    requester_email: str
    requester_dept: str = ""
    company_id: Optional[str] = None
    assignee_id: Optional[str] = None
    tags: list[str] = []
    system_info: Optional[dict] = None
    idempotency_key: Optional[str] = None


@router.post("", status_code=201)
def create_ticket(
    body: CreateTicketBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.idempotency_key:
        existing = db.query(models.Ticket).filter(
            models.Ticket.idempotency_key == body.idempotency_key
        ).first()
        if existing:
            return _serialize(existing)

    if body.priority not in SLA_WINDOWS:
        raise HTTPException(status_code=422, detail="Invalid priority")

    if body.priority in ("P1", "P2") and not (body.priority_justification or "").strip():
        raise HTTPException(status_code=422, detail=f"{body.priority} tickets require a justification explaining the business impact.")

    # Client users always submit as themselves
    is_client = current_user.role in ("CLIENT_USER", "CLIENT_MANAGER")
    requester_name = current_user.full_name if is_client else body.requester_name
    requester_email = current_user.email if is_client else body.requester_email
    company_id = body.company_id
    if is_client and not company_id:
        company_id = current_user.companies[0].id if current_user.companies else None

    needs_approval = (body.priority == "P1" and
                      current_user.role not in ("TEAM_MANAGER", "SYSTEM_ADMIN"))

    ticket = models.Ticket(
        ticket_number=_ticket_number(db),
        title=body.title,
        description=body.description,
        priority=body.priority,
        priority_justification=body.priority_justification,
        priority_pending_approval=needs_approval,
        requester_name=requester_name,
        requester_email=requester_email,
        requester_dept=body.requester_dept,
        company_id=company_id,
        assignee_id=body.assignee_id or None,
        tags=body.tags,
        system_info=body.system_info,
        idempotency_key=body.idempotency_key,
    )
    db.add(ticket)
    db.flush()

    action = "opened ticket"
    if needs_approval:
        action = f"opened ticket — P1 pending manager approval (justification: {body.priority_justification})"
    elif body.priority in ("P1", "P2") and body.priority_justification:
        action = f"opened ticket — {body.priority} justification: {body.priority_justification}"
    _add_log(db, ticket.id, current_user.full_name, action, actor_id=current_user.id)
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket)


# ── Update ticket ─────────────────────────────────────────────────────────────

class UpdateTicketBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None


@router.patch("/{ticket_id}")
def update_ticket(
    ticket_id: str,
    body: UpdateTicketBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    now = datetime.now(timezone.utc)

    if body.status and body.status != ticket.status:
        if body.status not in TICKET_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid status")
        ticket.status = body.status
        if body.status == "ACKNOWLEDGED" and not ticket.acknowledged_at:
            ticket.acknowledged_at = now
        elif body.status == "RESOLVED" and not ticket.resolved_at:
            ticket.resolved_at = now
        elif body.status == "CLOSED" and not ticket.closed_at:
            ticket.closed_at = now
        _add_log(db, ticket.id, current_user.full_name, f"status → {body.status}", actor_id=current_user.id)

    if body.priority and body.priority != ticket.priority:
        if current_user.role not in ("AGENT", "SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN"):
            raise HTTPException(status_code=403, detail="Only support staff can change ticket priority")
        if body.priority not in SLA_WINDOWS:
            raise HTTPException(status_code=422, detail="Invalid priority")
        ticket.priority = body.priority
        _add_log(db, ticket.id, current_user.full_name, f"priority → {body.priority}", actor_id=current_user.id)

    if "assignee_id" in body.model_fields_set:
        if body.assignee_id:
            agent = db.query(models.User).filter(models.User.id == body.assignee_id).first()
            if not agent:
                raise HTTPException(status_code=404, detail="Assignee not found")
            ticket.assignee_id = body.assignee_id
            _add_log(db, ticket.id, current_user.full_name, f"assigned to {agent.full_name}", actor_id=current_user.id)
        else:
            ticket.assignee_id = None
            _add_log(db, ticket.id, current_user.full_name, "removed assignee", actor_id=current_user.id)

    if body.tags is not None:
        ticket.tags = body.tags

    if body.description is not None and body.description != ticket.description:
        ticket.description = body.description
        _add_log(db, ticket.id, current_user.full_name, "updated description", actor_id=current_user.id)

    ticket.updated_at = now
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket)


# ── Approve P1 priority ───────────────────────────────────────────────────────

@router.post("/{ticket_id}/approve-priority")
def approve_priority(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("TEAM_MANAGER", "SYSTEM_ADMIN"):
        raise HTTPException(status_code=403, detail="Only Team Managers and Admins can approve P1 priority")
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not ticket.priority_pending_approval:
        raise HTTPException(status_code=400, detail="This ticket does not require priority approval")
    ticket.priority_pending_approval = False
    _add_log(db, ticket.id, current_user.full_name, "approved P1 priority", actor_id=current_user.id)
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket)


# ── Add log entry ─────────────────────────────────────────────────────────────

class AddLogBody(BaseModel):
    actor_label: str
    action: str
    meta: dict = {}
    is_internal: bool = False


@router.post("/{ticket_id}/logs", status_code=201)
def add_log(
    ticket_id: str,
    body: AddLogBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    actor_id = None if body.actor_label in ("System", "AI Assistant") else current_user.id
    log = models.AuditLog(
        ticket_id=ticket_id,
        actor_id=actor_id,
        actor_label=body.actor_label,
        action=body.action,
        meta=body.meta,
        is_internal=body.is_internal,
    )
    db.add(log)
    ticket.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket)


# ── Satisfaction rating ───────────────────────────────────────────────────────

class SatisfactionBody(BaseModel):
    score: int  # 1–5
    note: str = ""


@router.post("/{ticket_id}/satisfaction", status_code=200)
def submit_satisfaction(
    ticket_id: str,
    body: SatisfactionBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.score < 1 or body.score > 5:
        raise HTTPException(status_code=422, detail="Score must be between 1 and 5")
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.satisfaction_score = body.score
    ticket.satisfaction_note = body.note
    ticket.updated_at = datetime.now(timezone.utc)
    _add_log(db, ticket_id, current_user.full_name, f"submitted satisfaction rating: {body.score}/5", actor_id=current_user.id)
    db.commit()
    db.refresh(ticket)
    return _serialize(ticket)


# ── Queue position ────────────────────────────────────────────────────────────

@router.get("/meta/queue-position/{ticket_id}")
def queue_position(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.priority in ("P1", "P2"):
        return {"position": None, "total": None, "message": "Priority tickets are handled immediately"}

    active_statuses = ("OPEN", "ACKNOWLEDGED")
    queue = (
        db.query(models.Ticket)
        .filter(
            models.Ticket.status.in_(active_statuses),
            models.Ticket.priority.in_(("P3", "P4", "P5")),
        )
        .order_by(models.Ticket.created_at.asc())
        .all()
    )
    ids = [t.id for t in queue]
    position = ids.index(ticket_id) + 1 if ticket_id in ids else None
    return {"position": position, "total": len(queue)}


# ── List agents ───────────────────────────────────────────────────────────────

@router.get("/meta/agents")
def list_agents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    agents = db.query(models.User).filter(models.User.is_active == True).all()
    return [{"id": a.id, "full_name": a.full_name, "role": a.role} for a in agents]


# ── Split ticket ──────────────────────────────────────────────────────────────

class SplitTicketBody(BaseModel):
    title: str
    description: str = ""


@router.post("/{ticket_id}/split")
def split_ticket(
    ticket_id: str,
    body: SplitTicketBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("TEAM_MANAGER", "SYSTEM_ADMIN"):
        raise HTTPException(status_code=403, detail="Team Manager or higher required")
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status in ("RESOLVED", "CLOSED", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Cannot split a terminal ticket")

    new_ticket = models.Ticket(
        ticket_number=_ticket_number(db),
        title=body.title.strip(),
        description=body.description.strip(),
        priority=ticket.priority,
        status="OPEN",
        company_id=ticket.company_id,
        requester_name=ticket.requester_name,
        requester_email=ticket.requester_email,
        requester_dept=ticket.requester_dept,
        tags=[],
    )
    db.add(new_ticket)
    db.flush()

    _add_log(db, ticket.id, current_user.full_name, f"split → {new_ticket.ticket_number}", actor_id=current_user.id)
    _add_log(db, new_ticket.id, current_user.full_name, f"split from {ticket.ticket_number}", actor_id=current_user.id)

    ticket.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ticket)
    db.refresh(new_ticket)
    return {"original": _serialize(ticket), "new_ticket": _serialize(new_ticket)}


# ── Merge ticket ──────────────────────────────────────────────────────────────

class MergeTicketBody(BaseModel):
    target_ticket_number: str


@router.post("/{ticket_id}/merge")
def merge_ticket(
    ticket_id: str,
    body: MergeTicketBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("TEAM_MANAGER", "SYSTEM_ADMIN"):
        raise HTTPException(status_code=403, detail="Team Manager or higher required")
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.status in ("RESOLVED", "CLOSED", "CANCELLED"):
        raise HTTPException(status_code=400, detail="Cannot merge a terminal ticket")

    target = (
        db.query(models.Ticket)
        .filter(models.Ticket.ticket_number == body.target_ticket_number.upper())
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail=f"{body.target_ticket_number} not found")
    if target.id == ticket_id:
        raise HTTPException(status_code=400, detail="Cannot merge a ticket with itself")

    ticket.status = "CLOSED"
    ticket.updated_at = datetime.now(timezone.utc)
    _add_log(db, ticket.id, current_user.full_name, f"merged into {target.ticket_number}", actor_id=current_user.id)
    _add_log(db, target.id, current_user.full_name, f"merged with {ticket.ticket_number}", actor_id=current_user.id)

    db.commit()
    db.refresh(ticket)
    return _serialize(ticket)
