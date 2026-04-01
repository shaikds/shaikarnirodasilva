"""Pydantic schemas for request/response validation."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


# ---------- Client ----------

class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    company: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = None
    notes: Optional[str] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None


class ClientOut(BaseModel):
    id: int
    name: str
    company: str
    email: str
    phone: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- Project ----------

class ProjectCreate(BaseModel):
    client_id: int
    name: str = Field(..., min_length=1, max_length=200)
    service_type: str = Field(..., pattern=r"^(ai_agents|nocode_to_prod|web_dev|retainer)$")
    budget: Optional[float] = None
    timeline_weeks: Optional[int] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    service_type: Optional[str] = None
    status: Optional[str] = None
    budget: Optional[float] = None
    timeline_weeks: Optional[int] = None


class PhaseActionOut(BaseModel):
    id: int
    phase_id: int
    description: str
    hint: Optional[str] = None
    action_type: str
    status: str
    auto_result: Optional[str] = None
    sort_order: int
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProjectPhaseOut(BaseModel):
    id: int
    project_id: int
    phase_number: int
    phase_name: str
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    actions: List[PhaseActionOut] = []

    model_config = {"from_attributes": True}


class ProjectOut(BaseModel):
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
    phases: List[ProjectPhaseOut] = []
    client: Optional[ClientOut] = None

    model_config = {"from_attributes": True}


# ---------- Document Update ----------

class ActionDocumentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


# ---------- Dashboard ----------

class AlertOut(BaseModel):
    type: str
    project_id: int
    project_name: str
    message: str
    severity: str


class DashboardProjectOut(BaseModel):
    id: int
    name: str
    client_name: str
    service_type: str
    status: str
    current_phase: int
    current_phase_name: str
    budget: Optional[float] = None
    progress_percent: float
    days_in_phase: int
    actions_done: int
    actions_total: int


class DashboardOut(BaseModel):
    total_clients: int
    active_projects: int
    completed_projects: int
    total_revenue: float
    alerts: List[AlertOut]
    projects: List[DashboardProjectOut]
