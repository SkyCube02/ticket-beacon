from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from .database import SessionLocal
from . import models

SLA_WINDOWS_S = {"P1": 120, "P2": 120, "P3": 1800, "P4": 1800, "P5": 1800}

ACTIVE_STATUSES = {"OPEN", "ACKNOWLEDGED", "IN PROGRESS", "PENDING CLIENT", "ESCALATED"}


def check_sla_breaches():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        tickets = db.query(models.Ticket).filter(
            models.Ticket.status.in_(ACTIVE_STATUSES),
            models.Ticket.sla_breached == False,
        ).all()

        for ticket in tickets:
            window = SLA_WINDOWS_S.get(ticket.priority, 1800)
            elapsed = (now - ticket.created_at).total_seconds()

            if elapsed > window:
                ticket.sla_breached = True
                if ticket.status not in ("ESCALATED",):
                    ticket.status = "SLA BREACHED"
                ticket.updated_at = now

                log = models.AuditLog(
                    ticket_id=ticket.id,
                    actor_label="System",
                    action=f"SLA breach — {ticket.priority} window of {window // 60}m exceeded",
                )
                db.add(log)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[scheduler] SLA check error: {e}")
    finally:
        db.close()


def delete_old_tickets():
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=365)
        old = db.query(models.Ticket).filter(
            models.Ticket.status.in_(["CLOSED", "CANCELLED"]),
            models.Ticket.updated_at < cutoff,
        ).all()
        count = len(old)
        for t in old:
            db.delete(t)
        db.commit()
        if count:
            print(f"[retention] Purged {count} ticket(s) older than 12 months")
    except Exception as e:
        db.rollback()
        print(f"[retention] Error: {e}")
    finally:
        db.close()


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_sla_breaches, "interval", seconds=60, id="sla_check")
    scheduler.add_job(delete_old_tickets, "interval", hours=24, id="ticket_retention")
    scheduler.start()
    return scheduler
