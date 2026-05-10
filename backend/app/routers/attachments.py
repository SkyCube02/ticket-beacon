from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

ALLOWED_TYPES = {
    "image/png": "PNG",
    "image/jpeg": "JPG",
    "application/pdf": "PDF",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
}
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf", ".docx"}
MAX_SIZE = 5 * 1024 * 1024  # 5MB

MIME_MAP = {
    "PNG":  "image/png",
    "JPG":  "image/jpeg",
    "PDF":  "application/pdf",
    "DOCX": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


@router.post("/tickets/{ticket_id}", status_code=201)
async def upload_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Validate type
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"File type not allowed. Accepted: PNG, JPG, PDF, DOCX")

    file_type = ALLOWED_TYPES.get(file.content_type) or ext.lstrip(".").upper()
    if file_type not in ("PNG", "JPG", "PDF", "DOCX"):
        file_type = ext.lstrip(".").upper()

    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds 5MB limit")

    attachment = models.Attachment(
        ticket_id=ticket_id,
        file_name=file.filename,
        file_type=file_type,
        file_size_bytes=len(data),
        file_data=data,
        uploaded_by_id=current_user.id,
    )
    db.add(attachment)

    log = models.AuditLog(
        ticket_id=ticket_id,
        actor_id=current_user.id,
        actor_label=current_user.full_name,
        action=f"attached {file.filename} ({_fmt_size(len(data))})",
    )
    db.add(log)
    db.commit()
    db.refresh(attachment)

    return {
        "id": attachment.id,
        "file_name": attachment.file_name,
        "file_type": attachment.file_type,
        "file_size_bytes": attachment.file_size_bytes,
        "uploaded_by": current_user.full_name,
        "uploaded_at": attachment.uploaded_at.isoformat(),
    }


@router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    mime = MIME_MAP.get(attachment.file_type, "application/octet-stream")
    return Response(
        content=attachment.file_data,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{attachment.file_name}"'},
    )


@router.delete("/{attachment_id}")
def delete_attachment(
    attachment_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    attachment = db.query(models.Attachment).filter(models.Attachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    log = models.AuditLog(
        ticket_id=attachment.ticket_id,
        actor_id=current_user.id,
        actor_label=current_user.full_name,
        action=f"removed attachment {attachment.file_name}",
    )
    db.add(log)
    db.delete(attachment)
    db.commit()
    return {"ok": True}


def _fmt_size(b: int) -> str:
    if b < 1024: return f"{b}B"
    if b < 1024 ** 2: return f"{b // 1024}KB"
    return f"{b / 1024 ** 2:.1f}MB"
