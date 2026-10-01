from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import AgendaEventStatus, AgendaEventType
from app.models.process import Process


class AgendaEvent(TimestampMixin, Base):
    __tablename__ = "agenda_events"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "import_key", name="uq_agenda_events_workspace_import_key"
        ),
        Index("ix_agenda_events_workspace_starts", "workspace_id", "starts_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    process_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("processes.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    event_type: Mapped[AgendaEventType] = mapped_column(
        Enum(
            AgendaEventType,
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=AgendaEventType.COMMITMENT,
        nullable=False,
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[AgendaEventStatus] = mapped_column(
        Enum(
            AgendaEventStatus,
            native_enum=False,
            values_callable=lambda enum: [item.value for item in enum],
        ),
        default=AgendaEventStatus.SCHEDULED,
        index=True,
        nullable=False,
    )
    created_by: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    import_key: Mapped[str | None] = mapped_column(String(240))

    process: Mapped[Process | None] = relationship()
