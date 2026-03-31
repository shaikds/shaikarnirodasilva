from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.database import get_db
from src.middleware.auth import get_current_user
from src.models.user import User
from src.schemas.agent import AgentCreate, AgentListResponse, AgentResponse, AgentUpdate
from src.services import agent_service

router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(
    data: AgentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new AI agent."""
    return agent_service.create_agent(db, data, current_user)


@router.get("", response_model=AgentListResponse)
def list_agents(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all agents owned by the current user."""
    agents, total = agent_service.get_agents(db, current_user, skip, limit)
    return AgentListResponse(agents=agents, total=total)


@router.get("/{agent_id}", response_model=AgentResponse)
def get_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details of a specific agent."""
    return agent_service.get_agent(db, agent_id, current_user)


@router.put("/{agent_id}", response_model=AgentResponse)
def update_agent(
    agent_id: int,
    data: AgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an agent's configuration."""
    return agent_service.update_agent(db, agent_id, data, current_user)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an agent and all its executions."""
    agent_service.delete_agent(db, agent_id, current_user)
