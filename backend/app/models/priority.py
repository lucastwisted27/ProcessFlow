from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PriorityItem(TimestampMixin, Base):
    __tablename__ = "priority_items"
    __table_args__ = (
        Index(
            "ix_priority_items_workspace_type_completed",
            "workspace_id",
            "item_type",
            "completed",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    item_type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    process_number: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    counterparty: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    request_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    response_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    missing_document: Mapped[bool | None] = mapped_column(Boolean)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    created_by: Mapped[UUID] = mapped_column(Uuid, nullable=False)
