from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/emergency-contacts", tags=["emergency"])

# In-memory store for now — in production this would be a DB table per tenant
# These are the SimBix LLP emergency contacts returned to all clients
EMERGENCY_CONTACTS = [
    {
        "id": "ec-1",
        "name": "SimBix LLP — IT Support",
        "phone": "+44 1302 000 000",
        "email": "support@simbix.co.uk",
        "hours": "24/7 for P1/P2 — Mon–Fri 08:00–18:00 for all other tickets",
        "notes": "For critical outages outside business hours, call the emergency line.",
    },
    {
        "id": "ec-2",
        "name": "Emergency IT Line",
        "phone": "+44 7700 000 000",
        "email": None,
        "hours": "24/7 — P1/P2 only",
        "notes": "Only call this number for total service outages or data breaches.",
    },
]


@router.get("")
def get_contacts(
    current_user: models.User = Depends(get_current_user),
):
    return EMERGENCY_CONTACTS
