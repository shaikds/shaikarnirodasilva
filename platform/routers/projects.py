"""Project API endpoints."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    PhaseActionOut,
    ProjectCreate,
    ProjectListOut,
    ProjectOut,
    ProjectPhaseOut,
    ProjectUpdate,
)
from services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])
actions_router = APIRouter(prefix="/actions", tags=["actions"])


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    try:
        return project_service.create_project(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=list[ProjectListOut])
def list_projects(
    status: Optional[str] = None,
    service_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return project_service.get_projects(db, status=status, service_type=service_type)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = project_service.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = project_service.update_project(db, project_id, data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Re-fetch with full relationships
    return project_service.get_project(db, project_id)


@router.post("/{project_id}/advance")
def advance_project(project_id: int, db: Session = Depends(get_db)):
    try:
        return project_service.advance_project(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/phases/{phase_id}/start", response_model=ProjectPhaseOut)
def start_phase(project_id: int, phase_id: int, db: Session = Depends(get_db)):
    try:
        return project_service.start_phase(db, project_id, phase_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/phases/{phase_id}/complete", response_model=ProjectPhaseOut)
def complete_phase(project_id: int, phase_id: int, db: Session = Depends(get_db)):
    try:
        return project_service.complete_phase(db, project_id, phase_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@actions_router.put("/{action_id}/complete", response_model=PhaseActionOut)
def complete_action(action_id: int, db: Session = Depends(get_db)):
    try:
        return project_service.complete_action(db, action_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@actions_router.put("/{action_id}/undo", response_model=PhaseActionOut)
def undo_action(action_id: int, db: Session = Depends(get_db)):
    try:
        return project_service.undo_action(db, action_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
