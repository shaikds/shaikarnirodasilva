"""Dashboard API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Client, Project, ProjectPhase
from schemas import DashboardStats, TimelineProject
from services.workflow_engine import workflow_engine

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardStats)
def get_dashboard(db: Session = Depends(get_db)):
    total_clients = db.query(Client).count()
    total_projects = db.query(Project).count()
    active_projects = db.query(Project).filter(Project.status == "active").count()
    completed_projects = db.query(Project).filter(Project.status == "completed").count()
    on_hold_projects = db.query(Project).filter(Project.status == "on_hold").count()
    cancelled_projects = db.query(Project).filter(Project.status == "cancelled").count()

    # Phases breakdown: count of active projects in each phase
    phases_breakdown: dict[str, int] = {}
    active = db.query(Project).filter(Project.status == "active").all()
    for proj in active:
        strategy = workflow_engine.get_strategy(proj.current_phase)
        phase_name = strategy.phase_name
        phases_breakdown[phase_name] = phases_breakdown.get(phase_name, 0) + 1

    return DashboardStats(
        total_clients=total_clients,
        total_projects=total_projects,
        active_projects=active_projects,
        completed_projects=completed_projects,
        on_hold_projects=on_hold_projects,
        cancelled_projects=cancelled_projects,
        phases_breakdown=phases_breakdown,
    )


@router.get("/timeline", response_model=list[TimelineProject])
def get_timeline(db: Session = Depends(get_db)):
    projects = (
        db.query(Project)
        .options(joinedload(Project.client), joinedload(Project.phases))
        .filter(Project.status.in_(["active", "on_hold"]))
        .order_by(Project.updated_at.desc())
        .all()
    )

    result = []
    for proj in projects:
        strategy = workflow_engine.get_strategy(proj.current_phase)
        completed_phases = sum(1 for p in proj.phases if p.status == "completed")
        progress = (completed_phases / 11) * 100

        result.append(TimelineProject(
            id=proj.id,
            name=proj.name,
            service_type=proj.service_type,
            status=proj.status,
            current_phase=proj.current_phase,
            current_phase_name=strategy.phase_name,
            client_name=proj.client.name,
            created_at=proj.created_at,
            updated_at=proj.updated_at,
            timeline_weeks=proj.timeline_weeks,
            progress_percent=round(progress, 1),
        ))

    return result
