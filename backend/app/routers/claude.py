import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user
from ..config import settings
from .. import models

router = APIRouter(prefix="/api/claude", tags=["claude"])

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


class ClaudeRequest(BaseModel):
    model: str = "claude-sonnet-4-6"
    max_tokens: int = 1000
    system: str
    messages: list[dict]


@router.post("")
async def proxy_claude(
    body: ClaudeRequest,
    current_user: models.User = Depends(get_current_user),
):
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": body.model,
        "max_tokens": body.max_tokens,
        "system": body.system,
        "messages": body.messages,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(ANTHROPIC_URL, json=payload, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Claude API error")
    return resp.json()
