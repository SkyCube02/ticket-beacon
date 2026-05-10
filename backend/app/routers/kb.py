from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/kb", tags=["kb"])

EDITOR_ROLES = ("SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN")


def _serialize(article: models.KBArticle) -> dict:
    return {
        "id": article.id,
        "title": article.title,
        "content": article.content,
        "tags": article.tags or [],
        "category": article.category,
        "author": article.author.full_name if article.author else "System",
        "author_id": article.author_id,
        "is_archived": article.is_archived,
        "createdAt": article.created_at.isoformat(),
        "updatedAt": article.updated_at.isoformat(),
    }


@router.get("")
def list_articles(
    search: Optional[str] = None,
    category: Optional[str] = None,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.KBArticle)
    if not include_archived:
        q = q.filter(models.KBArticle.is_archived == False)
    if category:
        q = q.filter(models.KBArticle.category == category)
    if search:
        term = f"%{search.lower()}%"
        q = q.filter(
            models.KBArticle.title.ilike(term) |
            models.KBArticle.content.ilike(term)
        )
    return [_serialize(a) for a in q.order_by(models.KBArticle.created_at.desc()).all()]


@router.get("/categories")
def list_categories(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = db.query(models.KBArticle.category).filter(
        models.KBArticle.is_archived == False
    ).distinct().all()
    return sorted([r[0] for r in rows if r[0]])


@router.get("/{article_id}")
def get_article(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    article = db.query(models.KBArticle).filter(models.KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return _serialize(article)


class ArticleBody(BaseModel):
    title: str
    content: str
    tags: list[str] = []
    category: str = "General"


@router.post("", status_code=201)
def create_article(
    body: ArticleBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Senior Agent or above required")
    article = models.KBArticle(
        title=body.title,
        content=body.content,
        tags=body.tags,
        category=body.category,
        author_id=current_user.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return _serialize(article)


@router.patch("/{article_id}")
def update_article(
    article_id: str,
    body: ArticleBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Senior Agent or above required")
    article = db.query(models.KBArticle).filter(models.KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.title = body.title
    article.content = body.content
    article.tags = body.tags
    article.category = body.category
    article.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(article)
    return _serialize(article)


@router.delete("/{article_id}", status_code=200)
def archive_article(
    article_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Senior Agent or above required")
    article = db.query(models.KBArticle).filter(models.KBArticle.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    article.is_archived = True
    article.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# ── KB Edit Requests ──────────────────────────────────────────────────────────

def _serialize_req(r: models.KBEditRequest) -> dict:
    return {
        "id": r.id,
        "article_id": r.article_id,
        "article_title": r.article_title,
        "suggested_change": r.suggested_change,
        "requester_name": r.requester_name,
        "requester_email": r.requester_email,
        "status": r.status,
        "createdAt": r.created_at.isoformat(),
    }


class SuggestEditBody(BaseModel):
    suggestion: str


@router.post("/{article_id}/suggest-edit", status_code=201)
def suggest_edit(
    article_id: str,
    body: SuggestEditBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not body.suggestion.strip():
        raise HTTPException(status_code=422, detail="Suggestion cannot be empty")
    article = db.query(models.KBArticle).filter(
        models.KBArticle.id == article_id,
        models.KBArticle.is_archived == False,
    ).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    req = models.KBEditRequest(
        article_id=article_id,
        article_title=article.title,
        suggested_change=body.suggestion.strip(),
        requester_name=current_user.full_name,
        requester_email=current_user.email,
    )
    db.add(req)
    db.commit()
    return {"ok": True}


@router.get("/edit-requests")
def list_edit_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Senior Agent or above required")
    reqs = db.query(models.KBEditRequest).order_by(models.KBEditRequest.created_at.desc()).all()
    return [_serialize_req(r) for r in reqs]


class UpdateEditRequestBody(BaseModel):
    status: str  # REVIEWED | APPLIED


@router.patch("/edit-requests/{req_id}")
def update_edit_request(
    req_id: str,
    body: UpdateEditRequestBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="Senior Agent or above required")
    if body.status not in ("REVIEWED", "APPLIED"):
        raise HTTPException(status_code=422, detail="status must be REVIEWED or APPLIED")
    req = db.query(models.KBEditRequest).filter(models.KBEditRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Not found")
    req.status = body.status
    db.commit()
    return _serialize_req(req)
