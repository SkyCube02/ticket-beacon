from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/announcements", tags=["announcements"])

POSTER_ROLES = ("TEAM_MANAGER", "SYSTEM_ADMIN")
CATEGORIES = ("SECURITY", "PSA", "MAINTENANCE", "GENERAL")


def _serialize(a: models.Announcement) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "content": a.content,
        "category": a.category,
        "is_pinned": a.is_pinned,
        "author": a.author.full_name if a.author else "System",
        "author_id": a.author_id,
        "createdAt": a.created_at.isoformat(),
        "updatedAt": a.updated_at.isoformat(),
    }


@router.get("")
def list_announcements(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    announcements = (
        db.query(models.Announcement)
        .order_by(models.Announcement.is_pinned.desc(), models.Announcement.created_at.desc())
        .all()
    )
    return [_serialize(a) for a in announcements]


class AnnouncementBody(BaseModel):
    title: str
    content: str
    category: str = "GENERAL"
    is_pinned: bool = False


@router.post("", status_code=201)
def create_announcement(
    body: AnnouncementBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in POSTER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category")
    a = models.Announcement(
        title=body.title,
        content=body.content,
        category=body.category,
        is_pinned=body.is_pinned,
        author_id=current_user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _serialize(a)


@router.patch("/{announcement_id}")
def update_announcement(
    announcement_id: str,
    body: AnnouncementBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in POSTER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")
    a = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")
    a.title = body.title
    a.content = body.content
    a.category = body.category
    a.is_pinned = body.is_pinned
    a.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(a)
    return _serialize(a)


@router.delete("/{announcement_id}")
def delete_announcement(
    announcement_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in POSTER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")
    a = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Announcement not found")
    db.delete(a)
    db.commit()
    return {"ok": True}
