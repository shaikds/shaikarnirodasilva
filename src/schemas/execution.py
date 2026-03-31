from datetime import datetime

from pydantic import BaseModel, Field

from src.models.execution import ExecutionStatus


class ExecutionCreate(BaseModel):
    input_text: str = Field(min_length=1)


class ExecutionResponse(BaseModel):
    id: int
    agent_id: int
    user_id: int
    input_text: str
    output_text: str | None
    status: ExecutionStatus
    logs: str | None
    iterations_used: int
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExecutionListResponse(BaseModel):
    executions: list[ExecutionResponse]
    total: int
