from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    company = Column(String, nullable=False)
    email = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    projects = relationship("Project", back_populates="client", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    name = Column(String, nullable=False)
    service_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="active")
    current_phase = Column(Integer, nullable=False, default=1)
    budget = Column(Float, nullable=True)
    timeline_weeks = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    client = relationship("Client", back_populates="projects")
    phases = relationship(
        "ProjectPhase", back_populates="project",
        cascade="all, delete-orphan", order_by="ProjectPhase.phase_number"
    )


class ProjectPhase(Base):
    __tablename__ = "project_phases"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    phase_number = Column(Integer, nullable=False)
    phase_name = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    project = relationship("Project", back_populates="phases")
    actions = relationship(
        "PhaseAction", back_populates="phase",
        cascade="all, delete-orphan", order_by="PhaseAction.sort_order"
    )


class PhaseAction(Base):
    __tablename__ = "phase_actions"

    id = Column(Integer, primary_key=True, index=True)
    phase_id = Column(Integer, ForeignKey("project_phases.id"), nullable=False)
    description = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    auto_result = Column(Text, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    phase = relationship("ProjectPhase", back_populates="actions")
