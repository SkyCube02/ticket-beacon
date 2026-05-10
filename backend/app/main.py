import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from . import models
from .routers import auth, tickets, claude, kb, reports, users, companies, announcements, attachments, tasks, emergency, integrations, notifications
from .scheduler import start_scheduler

models.Base.metadata.create_all(bind=engine)


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


app = FastAPI(title="Ticket Beacon API", version="0.1.0", lifespan=lifespan)

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


@app.get("/api/health")
def health():
    return {"status": "ok"}
