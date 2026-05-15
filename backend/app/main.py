import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from . import models
from .config import settings
from .routers import auth, tickets, claude, kb, reports, users, companies, announcements, attachments, tasks, emergency, integrations, notifications, priority, calendar, chat
from .scheduler import start_scheduler

models.Base.metadata.create_all(bind=engine)

# ── Schema migrations (safe to run on every startup) ─────────────────────────
def _run_migrations():
    from sqlalchemy import text, inspect as sa_inspect
    insp = sa_inspect(engine)

    def add_col(conn, table, col, definition):
        cols = [c['name'] for c in insp.get_columns(table)]
        if col not in cols:
            conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {definition}'))
            print(f'[migration] added {table}.{col}', flush=True)

    with engine.begin() as conn:
        # users
        add_col(conn, 'users', 'phone_number',         'VARCHAR')
        add_col(conn, 'users', 'invited_by_id',        'VARCHAR')
        add_col(conn, 'users', 'totp_secret',          'VARCHAR')
        add_col(conn, 'users', 'mfa_enabled',          'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'users', 'mfa_restricted',       'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'users', 'mfa_reenrol_deadline', 'TIMESTAMPTZ')
        add_col(conn, 'users', 'mfa_reminded_12h',     'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'users', 'mfa_reminded_22h',     'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'users', 'profile_bio',          'TEXT')
        add_col(conn, 'users', 'profile_status',       "VARCHAR DEFAULT 'online'")
        add_col(conn, 'users', 'is_activated',         'BOOLEAN DEFAULT TRUE')

        # companies
        add_col(conn, 'companies', 'priority_tier',         'INTEGER DEFAULT 1')
        add_col(conn, 'companies', 'phone',                 'VARCHAR')
        add_col(conn, 'companies', 'website',               'VARCHAR')
        add_col(conn, 'companies', 'address',               'TEXT')
        add_col(conn, 'companies', 'contract_start',        'VARCHAR')
        add_col(conn, 'companies', 'contract_end',          'VARCHAR')
        add_col(conn, 'companies', 'sla_notes',             'TEXT')
        add_col(conn, 'companies', 'escalation_contact',    'VARCHAR')
        add_col(conn, 'companies', 'escalation_phone',      'VARCHAR')
        add_col(conn, 'companies', 'escalation_email',      'VARCHAR')
        add_col(conn, 'companies', 'notes',                 'TEXT')

        # tickets
        add_col(conn, 'tickets', 'requester_dept',              "VARCHAR DEFAULT ''")
        add_col(conn, 'tickets', 'system_info',                 'JSONB')
        add_col(conn, 'tickets', 'sla_breached',                'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'tickets', 'idempotency_key',             'VARCHAR')
        add_col(conn, 'tickets', 'satisfaction_score',          'INTEGER')
        add_col(conn, 'tickets', 'satisfaction_note',           'TEXT')
        add_col(conn, 'tickets', 'priority_justification',      'TEXT')
        add_col(conn, 'tickets', 'priority_pending_approval',   'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'tickets', 'acknowledged_at',             'TIMESTAMPTZ')
        add_col(conn, 'tickets', 'resolved_at',                 'TIMESTAMPTZ')
        add_col(conn, 'tickets', 'closed_at',                   'TIMESTAMPTZ')

        # attachments
        add_col(conn, 'attachments', 'blob_url',        'VARCHAR')
        add_col(conn, 'attachments', 'uploaded_by_id',  'VARCHAR')

        # audit_logs
        add_col(conn, 'audit_logs', 'is_internal', 'BOOLEAN DEFAULT FALSE')
        add_col(conn, 'audit_logs', 'actor_id',    'VARCHAR')

        # calendar_meetings unique index
        tables = sa_inspect(engine).get_table_names()
        if 'calendar_meetings' in tables:
            idxs = [i['name'] for i in insp.get_indexes('calendar_meetings')]
            if 'ix_calendar_meetings_external_uid' not in idxs:
                try:
                    conn.execute(text(
                        'CREATE UNIQUE INDEX IF NOT EXISTS ix_calendar_meetings_external_uid '
                        'ON calendar_meetings (external_uid) WHERE external_uid IS NOT NULL'
                    ))
                except Exception:
                    pass

_run_migrations()

# Azure Application Insights — instrument before the app starts
if settings.APPLICATIONINSIGHTS_CONNECTION_STRING:
    try:
        from azure.monitor.opentelemetry import configure_azure_monitor
        configure_azure_monitor(connection_string=settings.APPLICATIONINSIGHTS_CONNECTION_STRING)
        print("Azure Application Insights configured", flush=True)
    except Exception as exc:
        print(f"Application Insights setup failed: {exc}", flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        import sys
        sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
        from seed import seed
        seed()
    except Exception as e:
        print(f"Seed error: {e}", flush=True)
    scheduler = start_scheduler()
    yield
    scheduler.shutdown()


app = FastAPI(title="Beacon API", version="0.1.0", lifespan=lifespan)

_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:4173",
        "http://localhost", "https://localhost",
        "capacitor://localhost",
        "https://ticket-beacon.vercel.app",
    ] + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(tickets.router)
app.include_router(claude.router)
app.include_router(kb.router)
app.include_router(reports.router)
app.include_router(users.router)
app.include_router(companies.router)
app.include_router(announcements.router)
app.include_router(attachments.router)
app.include_router(tasks.router)
app.include_router(emergency.router)
app.include_router(integrations.router)
app.include_router(notifications.router)
app.include_router(priority.router)
app.include_router(calendar.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
