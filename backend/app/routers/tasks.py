from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from .. import models

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

STATUSES = ("TODO", "IN_PROGRESS", "DONE")


def _serialize(task: models.Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "notes": task.notes,
        "status": task.status,
        "assignee_id": task.assignee_id,
        "assignee": task.assignee.full_name if task.assignee else None,
        "created_by": task.created_by.full_name if task.created_by else None,
        "linked_ticket_id": task.linked_ticket_id,
        "due_date": task.due_date,
        "createdAt": task.created_at.isoformat(),
        "updatedAt": task.updated_at.isoformat(),
    }


@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tasks = db.query(models.Task).order_by(models.Task.created_at.desc()).all()
    return [_serialize(t) for t in tasks]


class TaskBody(BaseModel):
    title: str
    notes: str = ""
    status: str = "TODO"
    assignee_id: Optional[str] = None
    linked_ticket_id: Optional[str] = None
    due_date: Optional[str] = None


@router.post("", status_code=201)
def create_task(
    body: TaskBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")
    task = models.Task(
        title=body.title,
        notes=body.notes,
        status=body.status,
        assignee_id=body.assignee_id or None,
        created_by_id=current_user.id,
        linked_ticket_id=body.linked_ticket_id or None,
        due_date=body.due_date,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _serialize(task)


@router.patch("/{task_id}")
def update_task(
    task_id: str,
    body: TaskBody,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if body.status not in STATUSES:
        raise HTTPException(status_code=422, detail="Invalid status")
    task.title = body.title
    task.notes = body.notes
    task.status = body.status
    task.assignee_id = body.assignee_id or None
    task.linked_ticket_id = body.linked_ticket_id or None
    task.due_date = body.due_date
    task.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(task)
    return _serialize(task)


@router.delete("/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}
