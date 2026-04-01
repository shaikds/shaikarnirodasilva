"""Dashboard API endpoint."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Client, PhaseAction, Project, ProjectPhase
from schemas import AlertOut, DashboardOut, DashboardProjectOut
from services.workflow_engine import get_phase_definitions

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

PHASE_DEFS = get_phase_definitions()


@router.get("", response_model=DashboardOut)
def dashboard(
    status: Optional[str] = None,
    type: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    total_clients = db.query(Client).count()
    active = db.query(Project).filter(Project.status == "active").count()
    completed = db.query(Project).filter(Project.status == "completed").count()
    revenue = db.query(Project).filter(Project.status.in_(["active", "completed"])).all()
    total_revenue = sum(p.budget or 0 for p in revenue)

    query = db.query(Project).options(
        joinedload(Project.client),
        joinedload(Project.phases).joinedload(ProjectPhase.actions),
    )
    if status:
        query = query.filter(Project.status == status)
    elif not status:
        query = query.filter(Project.status.in_(["active", "on_hold"]))
    if type:
        query = query.filter(Project.service_type == type)
    if q:
        query = query.filter(Project.name.ilike(f"%{q}%"))
    projects = query.order_by(Project.updated_at.desc()).all()

    alerts: List[AlertOut] = []
    project_list: List[DashboardProjectOut] = []

    now = datetime.utcnow()
    for p in projects:
        total_actions = sum(len(ph.actions) for ph in p.phases)
        done_actions = sum(1 for ph in p.phases for a in ph.actions if a.status == "done")
        progress = (done_actions / total_actions * 100) if total_actions > 0 else 0

        current_ph = next((ph for ph in p.phases if ph.phase_number == p.current_phase), None)
        phase_name = current_ph.phase_name if current_ph else "Unknown"
        days_in = 0
        if current_ph and current_ph.started_at:
            days_in = (now - current_ph.started_at).days

        # Alerts
        if days_in > 7 and p.status == "active":
            alerts.append(AlertOut(type="phase_stuck", project_id=p.id, project_name=p.name, message=f"Phase \"{phase_name}\" open for {days_in} days", severity="warning"))

        if current_ph:
            pending_manual = [a for a in current_ph.actions if a.action_type == "manual" and a.status != "done"]
            if not pending_manual and current_ph.status == "in_progress":
                alerts.append(AlertOut(type="ready_to_advance", project_id=p.id, project_name=p.name, message=f"All tasks done in \"{phase_name}\" - ready to advance", severity="success"))

        project_list.append(DashboardProjectOut(
            id=p.id, name=p.name, client_name=p.client.name if p.client else "N/A",
            service_type=p.service_type, status=p.status, current_phase=p.current_phase,
            current_phase_name=phase_name, budget=p.budget, progress_percent=round(progress, 1),
            days_in_phase=days_in, actions_done=done_actions, actions_total=total_actions,
        ))

    return DashboardOut(
        total_clients=total_clients, active_projects=active, completed_projects=completed,
        total_revenue=total_revenue, alerts=alerts, projects=project_list,
    )
