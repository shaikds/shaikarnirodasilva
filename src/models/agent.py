from datetime import datetime

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(100), default="gpt-4")
    tools: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string of tool configs
    max_iterations: Mapped[int] = mapped_column(default=10)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Foreign Keys
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Relationships
    owner: Mapped["User"] = relationship(back_populates="agents")
    executions: Mapped[list["Execution"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
