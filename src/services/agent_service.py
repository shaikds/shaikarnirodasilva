import json

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.models.agent import Agent
from src.models.user import User
from src.schemas.agent import AgentCreate, AgentUpdate


def create_agent(db: Session, data: AgentCreate, owner: User) -> Agent:
    """Create a new agent for the given user."""
    agent = Agent(
        name=data.name,
        description=data.description,
        system_prompt=data.system_prompt,
        model=data.model,
        tools=json.dumps(data.tools) if data.tools else None,
        max_iterations=data.max_iterations,
        owner_id=owner.id,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def get_agents(db: Session, owner: User, skip: int = 0, limit: int = 20) -> tuple[list[Agent], int]:
    """Get all agents belonging to the user with pagination."""
    query = db.query(Agent).filter(Agent.owner_id == owner.id)
    total = query.count()
    agents = query.offset(skip).limit(limit).all()
    return agents, total


def get_agent(db: Session, agent_id: int, owner: User) -> Agent:
    """Get a specific agent. Raises 404 if not found or not owned by user."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.owner_id == owner.id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found",
        )
    return agent


def update_agent(db: Session, agent_id: int, data: AgentUpdate, owner: User) -> Agent:
    """Update an agent's fields. Only updates provided fields."""
    agent = get_agent(db, agent_id, owner)

    update_data = data.model_dump(exclude_unset=True)
    if "tools" in update_data and update_data["tools"] is not None:
        update_data["tools"] = json.dumps(update_data["tools"])

    for field, value in update_data.items():
        setattr(agent, field, value)

    db.commit()
    db.refresh(agent)
    return agent


def delete_agent(db: Session, agent_id: int, owner: User) -> None:
    """Delete an agent. Raises 404 if not found."""
    agent = get_agent(db, agent_id, owner)
    db.delete(agent)
    db.commit()
