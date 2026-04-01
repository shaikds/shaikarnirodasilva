"""Project API endpoints."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas import PhaseActionOut, ProjectCreate, ProjectOut, ProjectPhaseOut, ProjectUpdate
from services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])
actions_router = APIRouter(prefix="/actions", tags=["actions"])


@router.post("", response_model=ProjectOut, status_code=201)
def create(data: ProjectCreate, db: Session = Depends(get_db)):
    return project_service.create_project(db, data)


@router.get("", response_model=List[ProjectOut])
def list_all(status: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None, db: Session = Depends(get_db)):
    return project_service.get_projects(db, status=status, service_type=type, q=q)


@router.get("/{project_id}", response_model=ProjectOut)
def get_one(project_id: int, db: Session = Depends(get_db)):
    p = project_service.get_project(db, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.put("/{project_id}", response_model=ProjectOut)
def update(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    p = project_service.update_project(db, project_id, data)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.post("/{project_id}/phases/{phase_id}/start", response_model=ProjectPhaseOut)
def start_phase(project_id: int, phase_id: int, db: Session = Depends(get_db)):
    return project_service.start_phase(db, project_id, phase_id)


@router.post("/{project_id}/phases/{phase_id}/complete", response_model=ProjectPhaseOut)
def complete_phase(project_id: int, phase_id: int, db: Session = Depends(get_db)):
    return project_service.complete_phase(db, project_id, phase_id)


@router.post("/{project_id}/phases/{phase_id}/skip", response_model=ProjectPhaseOut)
def skip_phase(project_id: int, phase_id: int, db: Session = Depends(get_db)):
    return project_service.skip_phase(db, project_id, phase_id)


@router.post("/{project_id}/advance", response_model=ProjectOut)
def advance(project_id: int, db: Session = Depends(get_db)):
    return project_service.advance_project(db, project_id)


@actions_router.put("/{action_id}/toggle", response_model=PhaseActionOut)
def toggle_action(action_id: int, db: Session = Depends(get_db)):
    return project_service.toggle_action(db, action_id)


@actions_router.get("/{action_id}/document")
def get_document(action_id: int, db: Session = Depends(get_db)):
    return project_service.get_action_document(db, action_id)
