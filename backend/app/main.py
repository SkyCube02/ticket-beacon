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
    with engine.begin() as conn:
        cols = [c['name'] for c in insp.get_columns('attachments')]
        if 'blob_url' not in cols:
            conn.execute(text('ALTER TABLE attachments ADD COLUMN blob_url VARCHAR'))
            print('[migration] added attachments.blob_url', flush=True)

        # work_sessions and calendar_meetings are created by create_all above,
        # but add external_uid unique index if missing (safe re-run)
        # Profile columns on users
        user_cols = [c['name'] for c in insp.get_columns('users')]
        if 'profile_bio' not in user_cols:
            conn.execute(text('ALTER TABLE users ADD COLUMN profile_bio TEXT'))
            print('[migration] added users.profile_bio', flush=True)
        if 'profile_status' not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN profile_status VARCHAR DEFAULT 'online'"))
            print('[migration] added users.profile_status', flush=True)

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
