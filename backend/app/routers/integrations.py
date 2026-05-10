import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class TeamsNotifyBody(BaseModel):
    webhook_url: str
    payload: dict


@router.post("/teams-notify")
async def teams_notify(
    body: TeamsNotifyBody,
    current_user: models.User = Depends(get_current_user),
):
    if not body.webhook_url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Invalid webhook URL")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(body.webhook_url, json=body.payload)
            if not r.is_success:
                raise HTTPException(status_code=502, detail=f"Teams returned {r.status_code}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Could not reach Teams: {e}")
    return {"ok": True}
