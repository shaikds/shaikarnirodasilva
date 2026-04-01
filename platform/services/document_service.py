"""Document read and update service (Single Responsibility)."""
from __future__ import annotations

from typing import Dict

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import PhaseAction


def get_document(db: Session, action_id: int) -> Dict[str, str]:
    """Get a generated document's content."""
    action = db.query(PhaseAction).filter(PhaseAction.id == action_id).first()
    if not action:
        raise HTTPException(404, "Action not found")
    if not action.auto_result:
        raise HTTPException(404, "No document generated for this action")
    return {"action_id": action.id, "description": action.description, "content": action.auto_result}


def update_document(db: Session, action_id: int, content: str) -> Dict[str, str]:
    """Update a document's content (user edits). Persists to DB."""
    action = db.query(PhaseAction).filter(PhaseAction.id == action_id).first()
    if not action:
        raise HTTPException(404, "Action not found")
    action.auto_result = content
    db.commit()
    db.refresh(action)
    return {"action_id": action.id, "description": action.description, "content": action.auto_result}
