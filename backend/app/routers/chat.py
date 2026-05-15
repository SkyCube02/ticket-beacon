from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/chat", tags=["chat"])

STAFF_ROLES = {"AGENT", "SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN"}


def _agent_out(user: models.User, unread: int = 0) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name,
        "role": user.role,
        "profile_bio": user.profile_bio,
        "profile_status": user.profile_status or "online",
        "unread_count": unread,
    }


def _msg_out(m: models.Message) -> dict:
    return {
        "id": m.id,
        "sender_id": m.sender_id,
        "sender_name": m.sender.full_name if m.sender else "Unknown",
        "recipient_id": m.recipient_id,
        "content": m.content,
        "created_at": m.created_at.isoformat(),
        "read_at": m.read_at.isoformat() if m.read_at else None,
    }


@router.get("/agents")
def list_agents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """All staff agents (excluding current user) with unread message counts."""
    agents = (
        db.query(models.User)
        .filter(models.User.role.in_(STAFF_ROLES), models.User.id != current_user.id, models.User.is_active == True)
        .order_by(models.User.full_name)
        .all()
    )
    result = []
    for agent in agents:
        unread = (
            db.query(models.Message)
            .filter(
                models.Message.sender_id == agent.id,
                models.Message.recipient_id == current_user.id,
                models.Message.read_at == None,
            )
            .count()
        )
        result.append(_agent_out(agent, unread))
    return result


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    count = (
        db.query(models.Message)
        .filter(models.Message.recipient_id == current_user.id, models.Message.read_at == None)
        .count()
    )
    return {"count": count}


@router.get("/messages/{agent_id}")
def get_messages(
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    messages = (
        db.query(models.Message)
        .filter(
            or_(
                and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == agent_id),
                and_(models.Message.sender_id == agent_id, models.Message.recipient_id == current_user.id),
            )
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )
    # Mark received messages as read
    now = datetime.now(timezone.utc)
    for m in messages:
        if m.recipient_id == current_user.id and m.read_at is None:
            m.read_at = now
    db.commit()
    return [_msg_out(m) for m in messages]


class SendBody(BaseModel):
    content: str


@router.post("/messages/{agent_id}", status_code=201)
def send_message(
    agent_id: str,
    body: SendBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not body.content.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    recipient = db.query(models.User).filter(models.User.id == agent_id).first()
    if not recipient or recipient.role not in STAFF_ROLES:
        raise HTTPException(status_code=404, detail="Agent not found")

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=agent_id,
        content=body.content.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _msg_out(msg)


class StatusBody(BaseModel):
    profile_status: str
    profile_bio: str = None


@router.patch("/profile")
def update_profile(
    body: StatusBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    valid = {"online", "away", "busy", "offline"}
    if body.profile_status not in valid:
        raise HTTPException(status_code=422, detail="Invalid status")
    current_user.profile_status = body.profile_status
    if body.profile_bio is not None:
        current_user.profile_bio = body.profile_bio.strip() or None
    db.commit()
    return {"ok": True}
