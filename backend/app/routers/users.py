import hashlib
import secrets
from datetime import timedelta, timezone, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..auth import get_current_user, hash_password
from ..config import settings
from .. import models

router = APIRouter(prefix="/api/users", tags=["users"])

ROLES = ("AGENT", "SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN", "CLIENT_USER", "CLIENT_MANAGER")


def _serialize(user: models.User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
    }


def _require_admin(current_user: models.User):
    if current_user.role != "SYSTEM_ADMIN":
        raise HTTPException(status_code=403, detail="System Admin required")


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    users = db.query(models.User).order_by(models.User.created_at).all()
    return [_serialize(u) for u in users]


class CreateUserBody(BaseModel):
    email: str
    full_name: str
    role: str
    password: str


@router.post("", status_code=201)
def create_user(
    body: CreateUserBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    if body.role not in ROLES:
        raise HTTPException(status_code=422, detail="Invalid role")
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = models.User(
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _serialize(user)


class UpdateUserBody(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.patch("/{user_id}")
def update_user(
    user_id: str,
    body: UpdateUserBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot modify your own account")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(status_code=422, detail="Invalid role")
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    db.refresh(user)
    return _serialize(user)


@router.post("/{user_id}/invite")
def invite_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_activated:
        raise HTTPException(status_code=400, detail="User is already activated")

    # Revoke any existing token for this user
    db.query(models.ActivationToken).filter(
        models.ActivationToken.user_id == user_id
    ).delete()

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=72)

    db.add(models.ActivationToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    ))
    db.commit()

    invite_url = f"{settings.FRONTEND_URL}?token={raw_token}"
    return {"invite_url": invite_url, "expires_hours": 72}
