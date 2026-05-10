import hashlib
import re
import secrets
import time
from collections import defaultdict
from datetime import timedelta

import httpx
import pyotp
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..auth import (
    create_access_token, get_current_user, hash_password, verify_password,
)
from ..config import settings
from ..database import get_db
from ..models import now_utc

# ── Rate limiting / account lockout ──────────────────────────────────────────
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60
_login_state: dict = defaultdict(lambda: {"attempts": 0, "locked_until": 0.0})


def _password_errors(password: str) -> list:
    errors = []
    if len(password) < 12:
        errors.append("at least 12 characters")
    if not re.search(r'[A-Z]', password):
        errors.append("one uppercase letter")
    if not re.search(r'[a-z]', password):
        errors.append("one lowercase letter")
    if not re.search(r'\d', password):
        errors.append("one number")
    if not re.search(r'[^a-zA-Z0-9]', password):
        errors.append("one special character")
    return errors


def _user_out(user: models.User) -> dict:
    company = user.companies[0] if user.companies else None
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "mfa_enabled": user.mfa_enabled,
        "company_name": company.name if company else None,
        "company_id": company.id if company else None,
    }


router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form.username.lower().strip()
    state = _login_state[email]

    if state["locked_until"] > time.time():
        remaining = int((state["locked_until"] - time.time()) / 60) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Account locked after too many failed attempts. Try again in {remaining} minute(s).",
        )

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(form.password, user.password_hash):
        state["attempts"] += 1
        if state["attempts"] >= MAX_ATTEMPTS:
            state["locked_until"] = time.time() + LOCKOUT_SECONDS
            state["attempts"] = 0
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Account locked for {LOCKOUT_SECONDS // 60} minutes.",
            )
        remaining_attempts = MAX_ATTEMPTS - state["attempts"]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect email or password ({remaining_attempts} attempt(s) remaining before lockout).",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not user.is_activated:
        raise HTTPException(
            status_code=403,
            detail="Your account is pending activation. Check your invitation link from SimBix LLP.",
        )

    _login_state.pop(email, None)

    if user.mfa_enabled:
        mfa_token = create_access_token(
            {"sub": user.id, "mfa_pending": True},
            expires_delta=timedelta(minutes=5),
        )
        return {"requires_mfa": True, "mfa_token": mfa_token}

    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


# ── Me / Profile ──────────────────────────────────────────────────────────────

@router.get("/me")
def me(current_user: models.User = Depends(get_current_user)):
    return _user_out(current_user)


class UpdateProfileBody(BaseModel):
    full_name: str


@router.patch("/profile")
def update_profile(
    body: UpdateProfileBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not body.full_name.strip():
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    current_user.full_name = body.full_name.strip()
    db.commit()
    return _user_out(current_user)


# ── Change password ───────────────────────────────────────────────────────────

class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
def change_password(
    body: ChangePasswordBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    errors = _password_errors(body.new_password)
    if errors:
        raise HTTPException(status_code=422, detail=f"Password must contain: {', '.join(errors)}")

    history = (
        db.query(models.PasswordHistory)
        .filter(models.PasswordHistory.user_id == current_user.id)
        .order_by(models.PasswordHistory.created_at.desc())
        .limit(5)
        .all()
    )
    for entry in history:
        if verify_password(body.new_password, entry.password_hash):
            raise HTTPException(status_code=422, detail="You cannot reuse one of your last 5 passwords")

    db.add(models.PasswordHistory(user_id=current_user.id, password_hash=current_user.password_hash))
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


# ── Activation (invitation flow) ──────────────────────────────────────────────

class ActivateBody(BaseModel):
    token: str
    new_password: str


@router.post("/activate")
def activate_account(body: ActivateBody, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    record = (
        db.query(models.ActivationToken)
        .filter(models.ActivationToken.token_hash == token_hash)
        .first()
    )
    if not record or record.used or record.expires_at < now_utc():
        raise HTTPException(status_code=400, detail="Invalid or expired invitation link.")

    errors = _password_errors(body.new_password)
    if errors:
        raise HTTPException(status_code=422, detail=f"Password must contain: {', '.join(errors)}")

    user = record.user
    user.password_hash = hash_password(body.new_password)
    user.is_activated = True
    record.used = True
    db.commit()
    return {"ok": True, "email": user.email}


# ── 2FA — TOTP ────────────────────────────────────────────────────────────────

@router.get("/2fa/setup")
def setup_2fa(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    secret = pyotp.random_base32()
    current_user.totp_secret = secret
    db.commit()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="Ticket Beacon — SimBix LLP",
    )
    return {"secret": secret, "uri": uri}


class TotpCodeBody(BaseModel):
    totp_code: str


@router.post("/2fa/enable")
def enable_2fa(
    body: TotpCodeBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="Run /2fa/setup first")
    if not pyotp.TOTP(current_user.totp_secret).verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code — check your authenticator app")
    current_user.mfa_enabled = True
    db.commit()
    return {"ok": True, "mfa_enabled": True}


@router.post("/2fa/disable")
def disable_2fa(
    body: TotpCodeBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.mfa_enabled or not current_user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA is not enabled")
    if not pyotp.TOTP(current_user.totp_secret).verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    current_user.mfa_enabled = False
    current_user.totp_secret = None
    db.commit()
    return {"ok": True, "mfa_enabled": False}


class VerifyMfaBody(BaseModel):
    mfa_token: str
    totp_code: str


@router.post("/2fa/verify")
def verify_2fa(body: VerifyMfaBody, db: Session = Depends(get_db)):
    from jose import JWTError, jwt
    try:
        payload = jwt.decode(body.mfa_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired MFA token")

    if not payload.get("mfa_pending"):
        raise HTTPException(status_code=401, detail="Invalid MFA token")

    user_id = payload.get("sub")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or not user.mfa_enabled or not user.totp_secret:
        raise HTTPException(status_code=401, detail="User not found or MFA not configured")

    if not pyotp.TOTP(user.totp_secret).verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")

    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


# ── Azure AD SSO ──────────────────────────────────────────────────────────────

class AzureLoginBody(BaseModel):
    access_token: str


@router.post("/azure")
async def azure_login(body: AzureLoginBody, db: Session = Depends(get_db)):
    if not settings.AZURE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Azure AD SSO is not configured on this server.")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me",
            headers={"Authorization": f"Bearer {body.access_token}"},
            timeout=10,
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Microsoft access token")

    profile = resp.json()
    email = (profile.get("mail") or profile.get("userPrincipalName", "")).lower().strip()
    full_name = profile.get("displayName", email.split("@")[0])

    if not email:
        raise HTTPException(status_code=400, detail="Could not retrieve email from Microsoft account")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        user = models.User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            role="AGENT",
            is_activated=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}
