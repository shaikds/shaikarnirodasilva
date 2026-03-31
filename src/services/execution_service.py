import json
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.models.agent import Agent
from src.models.execution import Execution, ExecutionStatus
from src.models.user import User
from src.services.agent_service import get_agent


def execute_agent(db: Session, agent_id: int, input_text: str, user: User) -> Execution:
    """Create an execution and run the agent simulation.

    In a real production system, this would:
    1. Queue the execution as a background task (Celery/Redis)
    2. Call an actual AI API (OpenAI, Anthropic, etc.)
    3. Stream results back to the client

    For this project, we simulate agent execution with a step-by-step log.
    """
    agent = get_agent(db, agent_id, user)

    if not agent.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agent is deactivated",
        )

    execution = Execution(
        agent_id=agent.id,
        user_id=user.id,
        input_text=input_text,
        status=ExecutionStatus.RUNNING,
        started_at=datetime.utcnow(),
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    # Simulate agent execution
    try:
        result = _simulate_agent_run(agent, input_text)
        execution.output_text = result["output"]
        execution.logs = json.dumps(result["logs"])
        execution.iterations_used = result["iterations"]
        execution.status = ExecutionStatus.COMPLETED
        execution.completed_at = datetime.utcnow()
    except Exception as e:
        execution.status = ExecutionStatus.FAILED
        execution.error_message = str(e)
        execution.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(execution)
    return execution


def get_executions(
    db: Session, user: User, skip: int = 0, limit: int = 20
) -> tuple[list[Execution], int]:
    """Get all executions by the user with pagination."""
    query = db.query(Execution).filter(Execution.user_id == user.id)
    total = query.count()
    executions = query.order_by(Execution.created_at.desc()).offset(skip).limit(limit).all()
    return executions, total


def get_execution(db: Session, execution_id: int, user: User) -> Execution:
    """Get a specific execution. Raises 404 if not found."""
    execution = (
        db.query(Execution).filter(Execution.id == execution_id, Execution.user_id == user.id).first()
    )
    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Execution not found",
        )
    return execution


def cancel_execution(db: Session, execution_id: int, user: User) -> Execution:
    """Cancel a running execution."""
    execution = get_execution(db, execution_id, user)

    if execution.status not in (ExecutionStatus.PENDING, ExecutionStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel execution with status: {execution.status}",
        )

    execution.status = ExecutionStatus.CANCELLED
    execution.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(execution)
    return execution


def _simulate_agent_run(agent: Agent, input_text: str) -> dict:
    """Simulate an AI agent execution with step-by-step logs.

    This is where you'd integrate a real AI API. The simulation shows
    the structure of how an agent processes tasks iteratively.
    """
    logs = []
    tools = json.loads(agent.tools) if agent.tools else []

    # Step 1: Agent receives the task
    logs.append({
        "step": 1,
        "action": "receive_task",
        "detail": f"Agent '{agent.name}' received task: {input_text[:100]}",
    })

    # Step 2: Agent analyzes with its system prompt
    logs.append({
        "step": 2,
        "action": "analyze",
        "detail": f"Analyzing with model: {agent.model}",
    })

    # Step 3: Agent uses tools (if configured)
    if tools:
        for i, tool in enumerate(tools):
            logs.append({
                "step": 3 + i,
                "action": "use_tool",
                "detail": f"Using tool: {tool}",
            })

    # Final step: Generate response
    step_count = 3 + len(tools)
    logs.append({
        "step": step_count,
        "action": "generate_response",
        "detail": "Generating final response",
    })

    output = (
        f"[Simulated Response from '{agent.name}']\n\n"
        f"Task: {input_text}\n\n"
        f"Agent used {len(tools)} tools and {step_count} steps to process your request.\n"
        f"System prompt: {agent.system_prompt[:100]}...\n\n"
        f"In a production environment, this would call the {agent.model} API "
        f"and return a real AI-generated response."
    )

    return {
        "output": output,
        "logs": logs,
        "iterations": step_count,
    }
