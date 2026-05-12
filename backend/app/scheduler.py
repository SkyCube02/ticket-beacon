import os
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from .database import SessionLocal
from . import models

SLA_WINDOWS_S = {"P1": 120, "P2": 120, "P3": 1800, "P4": 1800, "P5": 1800}


def _send_sla_sms(ticket):
    to = ticket.assignee.phone_number if ticket.assignee else None
    if not to:
        return
    msg = (
        f"[Beacon] SLA BREACH — {ticket.priority} ticket {ticket.ticket_number}: "
        f'"{ticket.title[:60]}". Immediate action required.'
    )
    _send_sla_sms_to(to, msg)

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

                if ticket.priority in ("P1", "P2"):
                    _send_sla_sms(ticket)
                    _make_sla_call(ticket)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[scheduler] SLA check error: {e}")
    finally:
        db.close()


def check_mfa_reenrolment():
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        users = db.query(models.User).filter(
            models.User.mfa_restricted == True,
            models.User.mfa_reenrol_deadline != None,
            models.User.is_active == True,
        ).all()

        for user in users:
            deadline = user.mfa_reenrol_deadline
            hours_remaining = (deadline - now).total_seconds() / 3600

            if hours_remaining <= 0:
                user.is_active = False
                db.add(models.AuditLog(
                    ticket_id=None,
                    actor_label="System",
                    action=f"Account locked — {user.email} failed to re-enrol 2FA within 24 hours",
                ))
            elif hours_remaining <= 2 and not user.mfa_reminded_22h:
                user.mfa_reminded_22h = True
                _send_sla_sms_to(
                    user.phone_number,
                    f"[Beacon] Urgent: Your account will be locked in {int(hours_remaining * 60)} minutes if you do not re-enrol 2FA. Log in now.",
                )
            elif hours_remaining <= 12 and not user.mfa_reminded_12h:
                user.mfa_reminded_12h = True
                # In-app reminder is handled by the frontend reading mfa_reenrol_deadline

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[scheduler] MFA re-enrolment check error: {e}")
    finally:
        db.close()


def _send_sla_sms_to(to, message):
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_no = os.getenv("TWILIO_FROM_NUMBER", "")
    if not all([sid, token, from_no, to]):
        return
    try:
        from twilio.rest import Client  # type: ignore
        Client(sid, token).messages.create(body=message, from_=from_no, to=to)
    except Exception as e:
        print(f"[scheduler] SMS error: {e}")


def _make_sla_call(ticket):
    sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_no = os.getenv("TWILIO_FROM_NUMBER", "")
    if not all([sid, token, from_no]):
        return

    to = (
        (ticket.assignee.phone_number if ticket.assignee else None)
        or os.getenv("TWILIO_ALERT_TO", "")
    )
    if not to:
        return

    speech = (
        f"This is an automated alert from Beacon. "
        f"A {ticket.priority} priority ticket has breached its SLA. "
        f"Ticket number {' '.join(ticket.ticket_number)}, "
        f"title: {ticket.title[:80]}. "
        f"Immediate action is required. "
        f"This message will repeat. "
        f"A {ticket.priority} priority ticket has breached its SLA. "
        f"Ticket number {' '.join(ticket.ticket_number)}. "
        f"Immediate action is required."
    )
    twiml = f'<Response><Say voice="Google.en-GB-Standard-B" loop="1">{speech}</Say></Response>'

    try:
        from twilio.rest import Client  # type: ignore
        Client(sid, token).calls.create(twiml=twiml, from_=from_no, to=to)
    except Exception as e:
        print(f"[scheduler] Voice call error for {ticket.ticket_number}: {e}")


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
    scheduler.add_job(check_mfa_reenrolment, "interval", minutes=30, id="mfa_reenrol_check")
    scheduler.add_job(delete_old_tickets, "interval", hours=24, id="ticket_retention")
    scheduler.start()
    return scheduler
