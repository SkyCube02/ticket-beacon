from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _serialize(company: models.Company) -> dict:
    return {
        "id": company.id,
        "name": company.name,
        "is_active": company.is_active,
        "created_at": company.created_at.isoformat(),
        "agent_ids": [a.id for a in company.agents],
        "ticket_count": len(company.tickets),
    }


def _require_admin(user: models.User):
    if user.role != "SYSTEM_ADMIN":
        raise HTTPException(status_code=403, detail="System Admin required")


def get_visible_companies(user: models.User, db: Session):
    """System Admins see all companies; others see only their assigned ones."""
    if user.role == "SYSTEM_ADMIN":
        return db.query(models.Company).filter(models.Company.is_active == True).all()
    return [c for c in user.companies if c.is_active]


@router.get("")
def list_companies(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    companies = get_visible_companies(current_user, db)
    return [_serialize(c) for c in sorted(companies, key=lambda c: c.name)]


@router.get("/all")
def list_all_companies(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """For admin screens — always returns all companies."""
    _require_admin(current_user)
    companies = db.query(models.Company).order_by(models.Company.name).all()
    return [_serialize(c) for c in companies]


class CompanyBody(BaseModel):
    name: str
    is_active: Optional[bool] = True


@router.post("", status_code=201)
def create_company(
    body: CompanyBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    if db.query(models.Company).filter(models.Company.name == body.name).first():
        raise HTTPException(status_code=409, detail="Company name already exists")
    company = models.Company(name=body.name, is_active=body.is_active)
    db.add(company)
    db.commit()
    db.refresh(company)
    return _serialize(company)


@router.patch("/{company_id}")
def update_company(
    company_id: str,
    body: CompanyBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_admin(current_user)
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.name = body.name
    company.is_active = body.is_active
    db.commit()
    db.refresh(company)
    return _serialize(company)


# ── Agent assignments ─────────────────────────────────────────────────────────

class AssignAgentsBody(BaseModel):
    agent_ids: list[str]


@router.put("/{company_id}/agents")
def set_company_agents(
    company_id: str,
    body: AssignAgentsBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Replace the full agent list for a company."""
    _require_admin(current_user)
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    agents = db.query(models.User).filter(models.User.id.in_(body.agent_ids)).all()
    company.agents = agents
    db.commit()
    db.refresh(company)
    return _serialize(company)
