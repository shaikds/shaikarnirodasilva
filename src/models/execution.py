from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class ExecutionStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Execution(Base):
    __tablename__ = "executions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    input_text: Mapped[str] = mapped_column(Text)
    output_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ExecutionStatus] = mapped_column(
        Enum(ExecutionStatus), default=ExecutionStatus.PENDING
    )
    logs: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string of step logs
    iterations_used: Mapped[int] = mapped_column(default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)

    # Foreign Keys
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relationships
    agent: Mapped["Agent"] = relationship(back_populates="executions")
