from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from src.database import get_db
from src.middleware.auth import get_current_user
from src.models.user import User
from src.schemas.execution import ExecutionCreate, ExecutionListResponse, ExecutionResponse
from src.services import execution_service

router = APIRouter(tags=["Executions"])


@router.post(
    "/api/v1/agents/{agent_id}/execute",
    response_model=ExecutionResponse,
    status_code=status.HTTP_201_CREATED,
)
def execute_agent(
    agent_id: int,
    data: ExecutionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Execute an agent with the given input. Returns execution result with logs."""
    return execution_service.execute_agent(db, agent_id, data.input_text, current_user)


@router.get("/api/v1/executions", response_model=ExecutionListResponse)
def list_executions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all executions by the current user."""
    executions, total = execution_service.get_executions(db, current_user, skip, limit)
    return ExecutionListResponse(executions=executions, total=total)


@router.get("/api/v1/executions/{execution_id}", response_model=ExecutionResponse)
def get_execution(
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get details of a specific execution including logs."""
    return execution_service.get_execution(db, execution_id, current_user)


@router.post(
    "/api/v1/executions/{execution_id}/cancel",
    response_model=ExecutionResponse,
)
def cancel_execution(
    execution_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a pending or running execution."""
    return execution_service.cancel_execution(db, execution_id, current_user)
