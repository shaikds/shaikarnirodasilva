from datetime import datetime

from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    system_prompt: str = Field(min_length=1)
    model: str = Field(default="gpt-4", max_length=100)
    tools: list[str] | None = None  # List of tool names
    max_iterations: int = Field(default=10, ge=1, le=100)


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    system_prompt: str | None = Field(default=None, min_length=1)
    model: str | None = Field(default=None, max_length=100)
    tools: list[str] | None = None
    max_iterations: int | None = Field(default=None, ge=1, le=100)
    is_active: bool | None = None


class AgentResponse(BaseModel):
    id: int
    name: str
    description: str | None
    system_prompt: str
    model: str
    tools: str | None
    max_iterations: int
    is_active: bool
    owner_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int
