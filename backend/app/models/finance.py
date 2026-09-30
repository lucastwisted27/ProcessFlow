from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import FinancialKind, InstallmentFrequency, InstallmentStatus


class FinancialEntry(TimestampMixin, Base):
    __tablename__ = "financial_entries"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "import_key",
            name="uq_financial_entries_workspace_import_key",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    legacy_id: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[FinancialKind] = mapped_column(
        Enum(
            FinancialKind, native_enum=False, values_callable=lambda enum: [e.value for e in enum]
        ),
        nullable=False,
    )
    entry_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    # Chave opaca do backup original para tornar o merge idempotente.
    import_key: Mapped[str | None] = mapped_column(String(240))
    is_installment: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    frequency: Mapped[InstallmentFrequency | None] = mapped_column(
        Enum(
            InstallmentFrequency,
            native_enum=False,
            values_callable=lambda enum: [e.value for e in enum],
        )
    )

    installments: Mapped[list[Installment]] = relationship(
        back_populates="financial_entry", cascade="all, delete-orphan"
    )


class Installment(TimestampMixin, Base):
    __tablename__ = "installments"
    __table_args__ = (UniqueConstraint("financial_entry_id", "number"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    financial_entry_id: Mapped[UUID] = mapped_column(
        ForeignKey("financial_entries.id", ondelete="CASCADE"), index=True, nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    total_installments: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    received_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[InstallmentStatus] = mapped_column(
        Enum(
            InstallmentStatus,
            native_enum=False,
            values_callable=lambda enum: [e.value for e in enum],
        ),
        default=InstallmentStatus.PENDING,
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    financial_entry: Mapped[FinancialEntry] = relationship(back_populates="installments")
