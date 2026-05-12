from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/companies", tags=["companies"])

STAFF_ROLES = {"AGENT", "SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN"}


def _serialize(company: models.Company, full: bool = False) -> dict:
    base = {
        "id": company.id,
        "name": company.name,
        "is_active": company.is_active,
        "priority_tier": company.priority_tier or 1,
        "created_at": company.created_at.isoformat(),
        "agent_ids": [a.id for a in company.agents],
        "ticket_count": len(company.tickets),
    }
    if full:
        base.update({
            "phone": company.phone,
            "website": company.website,
            "address": company.address,
            "contract_start": company.contract_start,
            "contract_end": company.contract_end,
            "sla_notes": company.sla_notes,
            "escalation_contact": company.escalation_contact,
            "escalation_phone": company.escalation_phone,
            "escalation_email": company.escalation_email,
            "notes": company.notes,
            "agents": [
                {"id": a.id, "full_name": a.full_name, "role": a.role, "email": a.email}
                for a in company.agents
            ],
            "open_tickets": sum(
                1 for t in company.tickets
                if t.status not in ("CLOSED", "CANCELLED", "RESOLVED")
            ),
            "breached_tickets": sum(1 for t in company.tickets if t.sla_breached),
        })
    return base


def _require_admin(user: models.User):
    if user.role != "SYSTEM_ADMIN":
        raise HTTPException(status_code=403, detail="System Admin required")


def _require_staff(user: models.User):
    if user.role not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Staff access required")


def get_visible_companies(user: models.User, db: Session):
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
    _require_admin(current_user)
    companies = db.query(models.Company).order_by(models.Company.name).all()
    return [_serialize(c) for c in companies]


@router.get("/{company_id}")
def get_company(
    company_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _require_staff(current_user)
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    # Agents can only view companies they're assigned to
    if current_user.role not in ("SYSTEM_ADMIN", "TEAM_MANAGER"):
        assigned_ids = [c.id for c in current_user.companies]
        if company_id not in assigned_ids:
            raise HTTPException(status_code=403, detail="Not assigned to this company")
    return _serialize(company, full=True)


class CompanyBody(BaseModel):
    name: str
    is_active: Optional[bool] = True
    priority_tier: Optional[int] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    sla_notes: Optional[str] = None
    escalation_contact: Optional[str] = None
    escalation_phone: Optional[str] = None
    escalation_email: Optional[str] = None
    notes: Optional[str] = None


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
    if body.priority_tier is not None:
        company.priority_tier = max(1, min(3, body.priority_tier))
    company.phone = body.phone
    company.website = body.website
    company.address = body.address
    company.contract_start = body.contract_start
    company.contract_end = body.contract_end
    company.sla_notes = body.sla_notes
    company.escalation_contact = body.escalation_contact
    company.escalation_phone = body.escalation_phone
    company.escalation_email = body.escalation_email
    company.notes = body.notes
    db.commit()
    db.refresh(company)
    return _serialize(company, full=True)


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
    _require_admin(current_user)
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    agents = db.query(models.User).filter(models.User.id.in_(body.agent_ids)).all()
    company.agents = agents
    db.commit()
    db.refresh(company)
    return _serialize(company)
