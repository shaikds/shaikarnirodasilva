"""Project, phase, and action business logic."""
from __future__ import annotations

import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from models import Client, PhaseAction, Project, ProjectPhase
from schemas import ProjectCreate, ProjectUpdate
from services.document_generator import DocumentGenerator
from services.workflow_engine import get_phase_definitions

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates")
doc_gen = DocumentGenerator(TEMPLATES_DIR)


def create_project(db: Session, data: ProjectCreate) -> Project:
    client = db.query(Client).filter(Client.id == data.client_id).first()
    if not client:
        raise HTTPException(400, "Client not found")
    project = Project(
        client_id=data.client_id, name=data.name, service_type=data.service_type,
        budget=data.budget, timeline_weeks=data.timeline_weeks,
    )
    db.add(project)
    db.flush()
    phases = get_phase_definitions()
    for i, phase_def in enumerate(phases, start=1):
        phase = ProjectPhase(project_id=project.id, phase_number=i, phase_name=phase_def.phase_name)
        db.add(phase)
        db.flush()
        order = 0
        for auto in phase_def.get_auto_actions():
            db.add(PhaseAction(
                phase_id=phase.id, description=auto["description"], action_type="auto",
                sort_order=order,
            ))
            order += 1
        for manual in phase_def.get_manual_actions():
            db.add(PhaseAction(
                phase_id=phase.id, description=manual["description"], hint=manual.get("hint"),
                action_type="manual", sort_order=order,
            ))
            order += 1
    db.commit()
    db.refresh(project)
    return _load_full_project(db, project.id)


def get_projects(db: Session, status: Optional[str] = None, service_type: Optional[str] = None, q: Optional[str] = None) -> List[Project]:
    query = db.query(Project).options(joinedload(Project.client), joinedload(Project.phases).joinedload(ProjectPhase.actions))
    if status:
        query = query.filter(Project.status == status)
    if service_type:
        query = query.filter(Project.service_type == service_type)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%"))
    return query.order_by(Project.updated_at.desc()).all()


def get_project(db: Session, project_id: int) -> Optional[Project]:
    return _load_full_project(db, project_id)


def update_project(db: Session, project_id: int, data: ProjectUpdate) -> Optional[Project]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    db.commit()
    return _load_full_project(db, project.id)


def start_phase(db: Session, project_id: int, phase_id: int) -> ProjectPhase:
    phase = db.query(ProjectPhase).filter(ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id).first()
    if not phase:
        raise HTTPException(404, "Phase not found")
    if phase.status == "completed":
        raise HTTPException(400, "Phase already completed")
    phase.status = "in_progress"
    phase.started_at = datetime.utcnow()
    project = db.query(Project).options(joinedload(Project.client)).filter(Project.id == project_id).first()
    context = doc_gen.build_context(project, project.client)
    for action in phase.actions:
        if action.action_type == "auto":
            template_name = _get_template_for_action(phase.phase_number, action.description)
            if template_name:
                try:
                    action.auto_result = doc_gen.generate(template_name, context)
                    action.status = "done"
                    action.completed_at = datetime.utcnow()
                except Exception as e:
                    action.status = "failed"
                    action.auto_result = f"Error generating document: {e}"
    db.commit()
    db.refresh(phase)
    return phase


def complete_phase(db: Session, project_id: int, phase_id: int) -> ProjectPhase:
    phase = db.query(ProjectPhase).options(joinedload(ProjectPhase.actions)).filter(ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id).first()
    if not phase:
        raise HTTPException(404, "Phase not found")
    pending_manual = [a for a in phase.actions if a.action_type == "manual" and a.status != "done"]
    if pending_manual:
        names = ", ".join(a.description for a in pending_manual[:3])
        raise HTTPException(400, f"Complete all tasks first. {len(pending_manual)} remaining: {names}")
    phase.status = "completed"
    phase.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(phase)
    return phase


def skip_phase(db: Session, project_id: int, phase_id: int) -> ProjectPhase:
    phase = db.query(ProjectPhase).filter(ProjectPhase.id == phase_id, ProjectPhase.project_id == project_id).first()
    if not phase:
        raise HTTPException(404, "Phase not found")
    phase.status = "skipped"
    phase.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(phase)
    return phase


def advance_project(db: Session, project_id: int) -> Project:
    project = db.query(Project).options(joinedload(Project.phases).joinedload(ProjectPhase.actions)).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    current = next((p for p in project.phases if p.phase_number == project.current_phase), None)
    if current and current.status not in ("completed", "skipped"):
        pending = [a for a in current.actions if a.action_type == "manual" and a.status != "done"]
        if pending:
            raise HTTPException(400, f"Complete current phase first. {len(pending)} tasks remaining.")
        current.status = "completed"
        current.completed_at = datetime.utcnow()
    if project.current_phase >= 11:
        project.status = "completed"
        db.commit()
        return _load_full_project(db, project.id)
    project.current_phase += 1
    db.commit()
    return _load_full_project(db, project.id)


def toggle_action(db: Session, action_id: int) -> PhaseAction:
    action = db.query(PhaseAction).filter(PhaseAction.id == action_id).first()
    if not action:
        raise HTTPException(404, "Action not found")
    if action.status == "done":
        action.status = "pending"
        action.completed_at = None
    else:
        action.status = "done"
        action.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(action)
    return action


def get_action_document(db: Session, action_id: int) -> Dict[str, str]:
    action = db.query(PhaseAction).filter(PhaseAction.id == action_id).first()
    if not action:
        raise HTTPException(404, "Action not found")
    if not action.auto_result:
        raise HTTPException(404, "No document generated for this action")
    return {"action_id": action.id, "description": action.description, "content": action.auto_result}


def _load_full_project(db: Session, project_id: int) -> Optional[Project]:
    return db.query(Project).options(
        joinedload(Project.client),
        joinedload(Project.phases).joinedload(ProjectPhase.actions),
    ).filter(Project.id == project_id).first()


_TEMPLATE_MAP: Dict[int, str] = {
    1: "discovery", 2: "assessment", 3: "estimation", 4: "proposal",
    5: "sla", 6: "sprint_planning", 7: "sprint_planning", 8: "weekly_report",
    9: "qa_checklist", 10: "handoff", 11: "retainer_proposal",
}

def _get_template_for_action(phase_number: int, description: str) -> Optional[str]:
    return _TEMPLATE_MAP.get(phase_number)
