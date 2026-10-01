from __future__ import annotations

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.process import Process


class DjenSubscription(TimestampMixin, Base):
    __tablename__ = "djen_subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "oab_number", "oab_state", name="uq_djen_subscription_oab"
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    lawyer_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    oab_number: Mapped[str] = mapped_column(String(30), nullable=False)
    oab_state: Mapped[str] = mapped_column(String(2), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DjenPublication(TimestampMixin, Base):
    __tablename__ = "djen_publications"
    __table_args__ = (
        UniqueConstraint("workspace_id", "external_id", name="uq_djen_publication_external"),
        Index("ix_djen_publications_workspace_date", "workspace_id", "publication_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    process_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("processes.id", ondelete="SET NULL"), index=True
    )
    external_id: Mapped[str] = mapped_column(String(50), nullable=False)
    publication_hash: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    publication_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    tribunal: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    communication_type: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    court_body: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    document_type: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    medium: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    process_number: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    process_number_formatted: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    official_link: Mapped[str] = mapped_column(Text, default="", nullable=False)
    recipients: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    attorneys: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list, nullable=False)
    matched_oabs: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)

    process: Mapped[Process | None] = relationship()
