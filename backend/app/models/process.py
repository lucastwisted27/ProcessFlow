from __future__ import annotations

from datetime import date
from uuid import UUID, uuid4

from sqlalchemy import Date, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import ProcessPriority, ProcessStatus


class Process(TimestampMixin, Base):
    __tablename__ = "processes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "trello_id"),
        UniqueConstraint(
            "workspace_id",
            "import_key",
            name="uq_processes_workspace_import_key",
        ),
        Index("ix_processes_workspace_status_due", "workspace_id", "status", "due_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    legacy_id: Mapped[int | None] = mapped_column(Integer)
    client: Mapped[str] = mapped_column(String(300), nullable=False)
    number: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    process_type: Mapped[str] = mapped_column("type", String(200), default="", nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    next_action: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    priority: Mapped[ProcessPriority] = mapped_column(
        Enum(
            ProcessPriority, native_enum=False, values_callable=lambda enum: [e.value for e in enum]
        ),
        default=ProcessPriority.NORMAL,
        nullable=False,
    )
    status: Mapped[ProcessStatus] = mapped_column(
        Enum(
            ProcessStatus, native_enum=False, values_callable=lambda enum: [e.value for e in enum]
        ),
        default=ProcessStatus.IN_PROGRESS,
        index=True,
        nullable=False,
    )
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    origin: Mapped[str] = mapped_column(String(50), default="manual", nullable=False)
    # Identificador estável do arquivo de origem. Ele permite reimportar um backup
    # sem duplicar registros e nunca é usado para escolher o workspace de destino.
    import_key: Mapped[str | None] = mapped_column(String(240))
    trello_id: Mapped[str | None] = mapped_column(String(100))
    trello_url: Mapped[str | None] = mapped_column(Text)

    attachments: Mapped[list[ProcessAttachment]] = relationship(
        back_populates="process", cascade="all, delete-orphan"
    )


class ProcessAttachment(TimestampMixin, Base):
    __tablename__ = "process_attachments"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    process_id: Mapped[UUID] = mapped_column(
        ForeignKey("processes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)

    process: Mapped[Process] = relationship(back_populates="attachments")
