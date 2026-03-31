from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Client schemas
# ---------------------------------------------------------------------------

class ClientCreate(BaseModel):
    name: str
    company: str
    email: str
    phone: Optional[str] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    company: str
    email: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# PhaseAction schemas
# ---------------------------------------------------------------------------

class PhaseActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    phase_id: int
    description: str
    action_type: str
    status: str
    auto_result: Optional[str] = None
    completed_at: Optional[datetime] = None
    sort_order: int


# ---------------------------------------------------------------------------
# ProjectPhase schemas
# ---------------------------------------------------------------------------

class ProjectPhaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    phase_number: int
    phase_name: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actions: list[PhaseActionOut] = []


# ---------------------------------------------------------------------------
# Project schemas
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    client_id: int
    name: str
    service_type: str
    budget: Optional[float] = None
    timeline_weeks: Optional[int] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    status: Optional[str] = None
    budget: Optional[float] = None
    timeline_weeks: Optional[int] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    name: str
    service_type: str
    status: str
    current_phase: int
    budget: Optional[float] = None
    timeline_weeks: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    client: ClientOut
    phases: list[ProjectPhaseOut] = []


class ProjectListOut(BaseModel):
    """Lighter schema for list endpoints (no nested phases)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    name: str
    service_type: str
    status: str
    current_phase: int
    budget: Optional[float] = None
    timeline_weeks: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    client: ClientOut


# ---------------------------------------------------------------------------
# Dashboard schemas
# ---------------------------------------------------------------------------

class DashboardStats(BaseModel):
    total_clients: int
    total_projects: int
    active_projects: int
    completed_projects: int
    on_hold_projects: int
    cancelled_projects: int
    phases_breakdown: dict[str, int]


class TimelineProject(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    service_type: str
    status: str
    current_phase: int
    current_phase_name: str
    client_name: str
    created_at: datetime
    updated_at: datetime
    timeline_weeks: Optional[int] = None
    progress_percent: float
