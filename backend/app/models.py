import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer,
    ForeignKey, Enum, Text, JSON, Table, LargeBinary
)
from sqlalchemy.orm import relationship
from .database import Base

def now_utc():
    return datetime.now(timezone.utc)

def new_uuid():
    return str(uuid.uuid4())


# Many-to-many: agents assigned to companies
agent_company_assignments = Table(
    "agent_company_assignments",
    Base.metadata,
    Column("agent_id", String, ForeignKey("users.id"), primary_key=True),
    Column("company_id", String, ForeignKey("companies.id"), primary_key=True),
)


class Company(Base):
    __tablename__ = "companies"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False, unique=True)
    is_active = Column(Boolean, default=True)
    priority_tier = Column(Integer, default=1)  # 1=Standard, 2=Premium, 3=Critical

    # Contact info
    phone = Column(String, nullable=True)
    website = Column(String, nullable=True)
    address = Column(Text, nullable=True)

    # Contract
    contract_start = Column(String, nullable=True)  # ISO date string
    contract_end = Column(String, nullable=True)
    sla_notes = Column(Text, nullable=True)

    # Escalation
    escalation_contact = Column(String, nullable=True)
    escalation_phone = Column(String, nullable=True)
    escalation_email = Column(String, nullable=True)

    # Internal
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), default=now_utc)

    tickets = relationship("Ticket", back_populates="company")
    agents = relationship("User", secondary=agent_company_assignments, back_populates="companies")


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=new_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(
        Enum("AGENT", "SENIOR_AGENT", "TEAM_MANAGER", "SYSTEM_ADMIN",
             "CLIENT_USER", "CLIENT_MANAGER", name="user_role"),
        nullable=False,
        default="AGENT",
    )
    is_active = Column(Boolean, default=True)
    is_activated = Column(Boolean, default=True)
    invited_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    totp_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_restricted = Column(Boolean, default=False)
    mfa_reenrol_deadline = Column(DateTime(timezone=True), nullable=True)
    mfa_reminded_12h = Column(Boolean, default=False)
    mfa_reminded_22h = Column(Boolean, default=False)
    phone_number = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    assigned_tickets = relationship("Ticket", back_populates="assignee", foreign_keys="Ticket.assignee_id")
    logs = relationship("AuditLog", back_populates="actor_user", foreign_keys="AuditLog.actor_id")
    companies = relationship("Company", secondary=agent_company_assignments, back_populates="agents")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    user = relationship("User", foreign_keys=[user_id])


class MfaOverrideCode(Base):
    __tablename__ = "mfa_override_codes"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    generated_by_id = Column(String, ForeignKey("users.id"), nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    user = relationship("User", foreign_keys=[user_id])
    generated_by = relationship("User", foreign_keys=[generated_by_id])


class ActivationToken(Base):
    __tablename__ = "activation_tokens"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, unique=True)
    token_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)

    user = relationship("User", foreign_keys=[user_id])


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(String, primary_key=True, default=new_uuid)
    ticket_number = Column(String, unique=True, nullable=False)

    title = Column(String, nullable=False)
    description = Column(Text, default="")
    status = Column(
        Enum(
            "OPEN", "ACKNOWLEDGED", "IN PROGRESS", "PENDING CLIENT",
            "RESOLVED", "CLOSED", "ESCALATED", "SLA BREACHED", "CANCELLED",
            name="ticket_status",
        ),
        nullable=False,
        default="OPEN",
    )
    priority = Column(
        Enum("P1", "P2", "P3", "P4", "P5", name="ticket_priority"),
        nullable=False,
        default="P3",
    )

    requester_name = Column(String, nullable=False)
    requester_email = Column(String, nullable=False)
    requester_dept = Column(String, default="")

    company_id = Column(String, ForeignKey("companies.id"), nullable=True)
    company = relationship("Company", back_populates="tickets")

    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    assignee = relationship("User", back_populates="assigned_tickets", foreign_keys=[assignee_id])

    tags = Column(JSON, default=list)
    system_info = Column(JSON, nullable=True)
    sla_breached = Column(Boolean, default=False)
    idempotency_key = Column(String, unique=True, nullable=True)
    satisfaction_score = Column(Integer, nullable=True)
    satisfaction_note = Column(Text, nullable=True)
    priority_justification = Column(Text, nullable=True)
    priority_pending_approval = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)

    logs = relationship("AuditLog", back_populates="ticket", order_by="AuditLog.timestamp")
    attachments = relationship("Attachment", back_populates="ticket", order_by="Attachment.uploaded_at")


class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(String, primary_key=True, default=new_uuid)
    ticket_id = Column(String, ForeignKey("tickets.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    file_data = Column(LargeBinary, nullable=False)
    uploaded_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), default=now_utc)

    ticket = relationship("Ticket", back_populates="attachments")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])


class KBArticle(Base):
    __tablename__ = "kb_articles"

    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    tags = Column(JSON, default=list)
    category = Column(String, default="General")
    author_id = Column(String, ForeignKey("users.id"), nullable=True)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    author = relationship("User", foreign_keys=[author_id])


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String, nullable=False)
    notes = Column(Text, default="")
    status = Column(
        Enum("TODO", "IN_PROGRESS", "DONE", name="task_status"),
        nullable=False, default="TODO",
    )
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    linked_ticket_id = Column(String, ForeignKey("tickets.id"), nullable=True)
    due_date = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    assignee = relationship("User", foreign_keys=[assignee_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    category = Column(
        Enum("SECURITY", "PSA", "MAINTENANCE", "GENERAL", name="announcement_category"),
        nullable=False,
        default="GENERAL",
    )
    is_pinned = Column(Boolean, default=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now_utc)
    updated_at = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    author = relationship("User", foreign_keys=[author_id])


class PasswordHistory(Base):
    __tablename__ = "password_history"

    id = Column(String, primary_key=True, default=new_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    user = relationship("User", foreign_keys=[user_id])


class KBEditRequest(Base):
    __tablename__ = "kb_edit_requests"

    id = Column(String, primary_key=True, default=new_uuid)
    article_id = Column(String, ForeignKey("kb_articles.id"), nullable=False)
    article_title = Column(String, nullable=False)
    suggested_change = Column(Text, nullable=False)
    requester_name = Column(String, nullable=False)
    requester_email = Column(String, nullable=False)
    status = Column(
        Enum("PENDING", "REVIEWED", "APPLIED", name="edit_request_status"),
        nullable=False, default="PENDING",
    )
    created_at = Column(DateTime(timezone=True), default=now_utc)

    article = relationship("KBArticle")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=new_uuid)
    ticket_id = Column(String, ForeignKey("tickets.id"), nullable=True)
    actor_id = Column(String, ForeignKey("users.id"), nullable=True)
    actor_label = Column(String, nullable=False)
    action = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=now_utc)
    meta = Column(JSON, default=dict)
    is_internal = Column(Boolean, default=False)

    ticket = relationship("Ticket", back_populates="logs")
    actor_user = relationship("User", back_populates="logs", foreign_keys=[actor_id])
