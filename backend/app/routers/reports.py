import io
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/reports", tags=["reports"])

MANAGER_ROLES = ("TEAM_MANAGER", "SYSTEM_ADMIN")
SLA_WINDOWS_S = {"P1": 120, "P2": 120, "P3": 1800, "P4": 1800, "P5": 1800}


def _build_summary(db: Session) -> dict:
    tickets = db.query(models.Ticket).all()

    total = len(tickets)
    by_status: dict = {}
    by_priority: dict = {}
    for t in tickets:
        by_status[t.status] = by_status.get(t.status, 0) + 1
        by_priority[t.priority] = by_priority.get(t.priority, 0) + 1

    open_count = sum(v for k, v in by_status.items() if k not in ("CLOSED", "CANCELLED", "RESOLVED"))
    breached = sum(1 for t in tickets if t.sla_breached)

    sla_compliance = {}
    for p in ("P1", "P2", "P3", "P4", "P5"):
        p_tickets = [t for t in tickets if t.priority == p]
        if not p_tickets:
            sla_compliance[p] = None
            continue
        window = SLA_WINDOWS_S[p]
        compliant = sum(
            1 for t in p_tickets
            if t.acknowledged_at and (t.acknowledged_at - t.created_at).total_seconds() <= window
        )
        sla_compliance[p] = round(compliant / len(p_tickets) * 100, 1)

    avg_resolution = {}
    for p in ("P1", "P2", "P3", "P4", "P5"):
        resolved = [t for t in tickets if t.priority == p and t.resolved_at]
        if not resolved:
            avg_resolution[p] = None
            continue
        times = [(t.resolved_at - t.created_at).total_seconds() / 3600 for t in resolved]
        avg_resolution[p] = round(sum(times) / len(times), 1)

    rated = [t for t in tickets if t.satisfaction_score is not None]
    avg_satisfaction = round(sum(t.satisfaction_score for t in rated) / len(rated), 2) if rated else None
    satisfaction_dist = {str(i): sum(1 for t in rated if t.satisfaction_score == i) for i in range(1, 6)}

    agents = db.query(models.User).filter(models.User.is_active == True).all()
    agent_stats = []
    for agent in agents:
        assigned = [t for t in tickets if t.assignee_id == agent.id]
        resolved_a = [t for t in assigned if t.resolved_at]
        rated_a = [t for t in assigned if t.satisfaction_score is not None]
        avg_sat = round(sum(t.satisfaction_score for t in rated_a) / len(rated_a), 1) if rated_a else None
        avg_res_h = None
        if resolved_a:
            times = [(t.resolved_at - t.created_at).total_seconds() / 3600 for t in resolved_a]
            avg_res_h = round(sum(times) / len(times), 1)
        agent_stats.append({
            "id": agent.id,
            "name": agent.full_name,
            "role": agent.role,
            "assigned": len(assigned),
            "resolved": len(resolved_a),
            "avg_resolution_hours": avg_res_h,
            "avg_satisfaction": avg_sat,
        })
    agent_stats.sort(key=lambda a: a["resolved"], reverse=True)

    now = datetime.now(timezone.utc)
    daily = []
    for i in range(13, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = sum(1 for t in tickets if day_start <= t.created_at < day_end)
        daily.append({"date": day_start.strftime("%d %b"), "count": count})

    return {
        "total": total,
        "open": open_count,
        "breached": breached,
        "avg_satisfaction": avg_satisfaction,
        "by_status": by_status,
        "by_priority": by_priority,
        "sla_compliance": sla_compliance,
        "avg_resolution_hours": avg_resolution,
        "satisfaction_dist": satisfaction_dist,
        "agent_stats": agent_stats,
        "daily_volume": daily,
        "generated_at": now.strftime("%Y-%m-%d %H:%M UTC"),
    }


@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")
    return _build_summary(db)


@router.get("/summary/export/csv")
def export_csv(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")

    import pandas as pd
    data = _build_summary(db)
    buf = io.StringIO()

    # Summary stats
    pd.DataFrame([{
        "Total Tickets": data["total"],
        "Open": data["open"],
        "SLA Breached": data["breached"],
        "Avg Satisfaction": data["avg_satisfaction"] or "N/A",
        "Generated": data["generated_at"],
    }]).to_csv(buf, index=False)

    buf.write("\nSLA Compliance (%)\n")
    pd.DataFrame([data["sla_compliance"]]).to_csv(buf, index=False)

    buf.write("\nAvg Resolution (hours)\n")
    pd.DataFrame([data["avg_resolution_hours"]]).to_csv(buf, index=False)

    buf.write("\nTickets by Status\n")
    pd.DataFrame([data["by_status"]]).to_csv(buf, index=False)

    buf.write("\nAgent Performance\n")
    pd.DataFrame(data["agent_stats"]).drop(columns=["id"], errors="ignore").to_csv(buf, index=False)

    buf.write("\nDaily Volume (last 14 days)\n")
    pd.DataFrame(data["daily_volume"]).to_csv(buf, index=False)

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ticket-beacon-report.csv"},
    )


@router.get("/summary/export/pdf")
def export_pdf(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    data = _build_summary(db)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    styles = getSampleStyleSheet()
    accent = colors.HexColor("#2563eb")
    story = []

    def heading(text):
        return Paragraph(f"<font color='#2563eb'><b>{text}</b></font>", styles["Heading2"])

    def table(rows, col_widths=None):
        t = Table(rows, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), accent),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#0d1525"), colors.HexColor("#080d18")]),
            ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#f0f4ff")),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#1a2540")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ]))
        return t

    # Cover
    story.append(Paragraph("<b>Beacon</b>", styles["Title"]))
    story.append(Paragraph("SimBix LLP — Support Report", styles["Heading3"]))
    story.append(Paragraph(f"Generated: {data['generated_at']}", styles["Normal"]))
    story.append(Spacer(1, 0.5*cm))

    # Summary stats
    story.append(heading("Summary"))
    story.append(table([
        ["Total Tickets", "Open", "SLA Breached", "Avg Satisfaction"],
        [
            str(data["total"]),
            str(data["open"]),
            str(data["breached"]),
            f"{data['avg_satisfaction']}/5" if data["avg_satisfaction"] else "N/A",
        ],
    ]))
    story.append(Spacer(1, 0.4*cm))

    # SLA compliance
    story.append(heading("SLA Compliance"))
    story.append(table(
        [["Priority", "Compliance %"]] +
        [[p, f"{v}%" if v is not None else "N/A"] for p, v in data["sla_compliance"].items()]
    ))
    story.append(Spacer(1, 0.4*cm))

    # Agent performance
    story.append(heading("Agent Performance"))
    story.append(table(
        [["Agent", "Role", "Assigned", "Resolved", "Avg Res (h)", "Avg Sat"]] +
        [[
            a["name"], a["role"].replace("_", " "),
            str(a["assigned"]), str(a["resolved"]),
            str(a["avg_resolution_hours"]) if a["avg_resolution_hours"] else "—",
            str(a["avg_satisfaction"]) if a["avg_satisfaction"] else "—",
        ] for a in data["agent_stats"]]
    ))

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=ticket-beacon-report.pdf"},
    )


@router.get("/agents/{agent_id}")
def agent_detail(
    agent_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Team Manager or above required")

    agent = db.query(models.User).filter(models.User.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    tickets = db.query(models.Ticket).filter(models.Ticket.assignee_id == agent_id).all()
    now = datetime.now(timezone.utc)

    # Current open work
    active_statuses = {"OPEN", "ACKNOWLEDGED", "IN PROGRESS", "PENDING CLIENT", "ESCALATED", "SLA BREACHED"}
    active = [t for t in tickets if t.status in active_statuses]
    resolved = [t for t in tickets if t.status in ("RESOLVED", "CLOSED")]

    # Resolution times
    res_times = [(t.resolved_at - t.created_at).total_seconds() / 3600 for t in resolved if t.resolved_at]
    avg_res_h = round(sum(res_times) / len(res_times), 1) if res_times else None

    # Satisfaction
    rated = [t for t in tickets if t.satisfaction_score is not None]
    avg_sat = round(sum(t.satisfaction_score for t in rated) / len(rated), 1) if rated else None

    # Breached tickets this agent handled
    breached = sum(1 for t in tickets if t.sla_breached)

    # Priority breakdown
    by_priority = {}
    for t in tickets:
        by_priority[t.priority] = by_priority.get(t.priority, 0) + 1

    # Recent activity — last 50 audit log entries by this agent
    logs = (
        db.query(models.AuditLog)
        .filter(models.AuditLog.actor_id == agent_id)
        .order_by(models.AuditLog.timestamp.desc())
        .limit(50)
        .all()
    )
    activity = [
        {
            "id": l.id,
            "action": l.action,
            "ticket_id": l.ticket_id,
            "timestamp": l.timestamp.isoformat(),
        }
        for l in logs
    ]

    # Activity by day — last 14 days
    daily_activity = []
    for i in range(13, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = sum(1 for l in logs if day_start <= l.timestamp < day_end)
        daily_activity.append({"date": day_start.strftime("%d %b"), "count": count})

    # Active tickets detail
    active_detail = [
        {
            "id": t.id,
            "ticket_number": t.ticket_number,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "company_name": t.company.name if t.company else None,
            "created_at": t.created_at.isoformat(),
            "sla_breached": t.sla_breached,
        }
        for t in sorted(active, key=lambda t: t.created_at, reverse=True)
    ]

    # Recent resolved detail
    resolved_detail = [
        {
            "id": t.id,
            "ticket_number": t.ticket_number,
            "title": t.title,
            "priority": t.priority,
            "company_name": t.company.name if t.company else None,
            "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
            "resolution_hours": round((t.resolved_at - t.created_at).total_seconds() / 3600, 1) if t.resolved_at else None,
            "satisfaction_score": t.satisfaction_score,
        }
        for t in sorted(resolved, key=lambda t: t.resolved_at or t.created_at, reverse=True)[:20]
    ]

    return {
        "agent": {
            "id": agent.id,
            "full_name": agent.full_name,
            "email": agent.email,
            "role": agent.role,
            "is_active": agent.is_active,
        },
        "stats": {
            "total_assigned": len(tickets),
            "active": len(active),
            "resolved": len(resolved),
            "avg_resolution_hours": avg_res_h,
            "avg_satisfaction": avg_sat,
            "sla_breached": breached,
            "by_priority": by_priority,
        },
        "active_tickets": active_detail,
        "recent_resolved": resolved_detail,
        "recent_activity": activity,
        "daily_activity": daily_activity,
    }
