"""Phase navigation service - reopen completed phases (Single Responsibility)."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import ProjectPhase


def reopen_phase(db: Session, project_id: int, phase_id: int) -> ProjectPhase:
    """Reopen a completed phase for editing. Does NOT change project.current_phase."""
    phase = db.query(ProjectPhase).filter(
        ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id
    ).first()
    if not phase:
        raise HTTPException(404, "Phase not found")
    if phase.status != "completed":
        raise HTTPException(400, f"Can only reopen completed phases. Current status: {phase.status}")
    phase.status = "in_progress"
    phase.completed_at = None
    db.commit()
    db.refresh(phase)
    return phase
