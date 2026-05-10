import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class SMSBody(BaseModel):
    to: str
    message: str
    account_sid: str = ""
    auth_token: str = ""
    from_number: str = ""


@router.post("/sms")
async def send_sms(
    body: SMSBody,
    current_user: models.User = Depends(get_current_user),
):
    sid = body.account_sid or os.getenv("TWILIO_ACCOUNT_SID", "")
    token = body.auth_token or os.getenv("TWILIO_AUTH_TOKEN", "")
    from_no = body.from_number or os.getenv("TWILIO_FROM_NUMBER", "")

    if not all([sid, token, from_no]):
        return {"ok": False, "reason": "not_configured"}

    try:
        from twilio.rest import Client  # type: ignore
        client = Client(sid, token)
        msg = client.messages.create(body=body.message, from_=from_no, to=body.to)
        return {"ok": True, "sid": msg.sid}
    except ImportError:
        return {"ok": False, "reason": "sdk_missing"}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/twilio-status")
def twilio_status(current_user: models.User = Depends(get_current_user)):
    configured = bool(
        os.getenv("TWILIO_ACCOUNT_SID") and
        os.getenv("TWILIO_AUTH_TOKEN") and
        os.getenv("TWILIO_FROM_NUMBER")
    )
    return {"configured": configured}
