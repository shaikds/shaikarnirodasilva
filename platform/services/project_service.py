"""Project CRUD and phase management service layer."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session, joinedload

from models import Client, PhaseAction, Project, ProjectPhase
from schemas import ProjectCreate, ProjectUpdate
from services.workflow_engine import workflow_engine


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_project(db: Session, data: ProjectCreate) -> Project:
    """Create a project and initialize all 11 phases with actions."""
    # Verify client exists
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise ValueError(f"Client with id {data.client_id} not found")

    project = Project(**data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)

    # Initialize all 11 phases via the workflow engine
    workflow_engine.initialize_project_phases(db, project)

    db.refresh(project)
    return project


def get_projects(
    db: Session,
    status: Optional[str] = None,
    service_type: Optional[str] = None,
) -> list[Project]:
    query = db.query(Project).options(joinedload(Project.client))

    if status:
        query = query.filter(Project.status == status)
    if service_type:
        query = query.filter(Project.service_type == service_type)

    return query.order_by(Project.updated_at.desc()).all()


def get_project(db: Session, project_id: int) -> Project | None:
    return (
        db.query(Project)
        .options(
            joinedload(Project.client),
            joinedload(Project.phases).joinedload(ProjectPhase.actions),
        )
        .filter(Project.id == project_id)
        .first()
    )


def update_project(db: Session, project_id: int, data: ProjectUpdate) -> Project | None:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(project, key, value)

    project.updated_at = _utcnow()
    db.commit()
    db.refresh(project)
    return project


def advance_project(db: Session, project_id: int) -> dict:
    """Advance a project to the next phase."""
    project = get_project(db, project_id)
    if not project:
        raise ValueError(f"Project with id {project_id} not found")

    next_phase = workflow_engine.advance_project(db, project)
    db.refresh(project)

    if next_phase is None and project.current_phase >= 11:
        return {"message": "Project completed all phases", "project_id": project_id}

    return {
        "message": f"Advanced to phase {project.current_phase}: {next_phase.phase_name}" if next_phase else "Project completed",
        "project_id": project_id,
        "current_phase": project.current_phase,
    }


def start_phase(db: Session, project_id: int, phase_id: int) -> ProjectPhase:
    phase = (
        db.query(ProjectPhase)
        .options(joinedload(ProjectPhase.actions), joinedload(ProjectPhase.project))
        .filter(ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id)
        .first()
    )
    if not phase:
        raise ValueError(f"Phase {phase_id} not found for project {project_id}")
    return workflow_engine.start_phase(db, phase)


def complete_phase(db: Session, project_id: int, phase_id: int) -> ProjectPhase:
    phase = (
        db.query(ProjectPhase)
        .options(joinedload(ProjectPhase.actions), joinedload(ProjectPhase.project))
        .filter(ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id)
        .first()
    )
    if not phase:
        raise ValueError(f"Phase {phase_id} not found for project {project_id}")
    return workflow_engine.complete_phase(db, phase)


def complete_action(db: Session, action_id: int) -> PhaseAction:
    action = db.query(PhaseAction).filter(PhaseAction.id == action_id).first()
    if not action:
        raise ValueError(f"Action with id {action_id} not found")

    action.status = "done"
    action.completed_at = _utcnow()
    db.commit()
    db.refresh(action)
    return action


def undo_action(db: Session, action_id: int) -> PhaseAction:
    action = db.query(PhaseAction).filter(PhaseAction.id == action_id).first()
    if not action:
        raise ValueError(f"Action with id {action_id} not found")

    action.status = "pending"
    action.completed_at = None
    if action.action_type == "auto":
        action.auto_result = None
    db.commit()
    db.refresh(action)
    return action
