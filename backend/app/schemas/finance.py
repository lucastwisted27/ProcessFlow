from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    FinancialKind,
    InstallmentFrequency,
    InstallmentStatus,
)


class FinancialEntryCreate(BaseModel):
    kind: FinancialKind
    entry_date: date
    description: str = Field(min_length=1, max_length=500)
    category: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    notes: str = ""
    is_installment: bool = False
    frequency: InstallmentFrequency | None = None
    installment_count: int | None = Field(default=None, ge=2, le=120)
    first_due_date: date | None = None
    first_received: bool = False

    @model_validator(mode="after")
    def validate_installment(self) -> "FinancialEntryCreate":
        if self.is_installment:
            if not self.frequency or not self.installment_count or not self.first_due_date:
                raise ValueError(
                    "Lançamento parcelado exige periodicidade, quantidade e primeiro vencimento."
                )
            self.kind = FinancialKind.INCOME
        return self


class FinancialEntryUpdate(BaseModel):
    kind: FinancialKind | None = None
    entry_date: date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=500)
    category: str | None = Field(default=None, min_length=1, max_length=120)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=50_000)

    @field_validator("description", "category", "notes", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class InstallmentUpdate(BaseModel):
    due_date: date | None = None
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    status: InstallmentStatus | None = None


class InstallmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    number: int
    total_installments: int
    due_date: date
    received_date: date | None
    status: InstallmentStatus
    amount: Decimal


class FinancialEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    legacy_id: int | None
    kind: FinancialKind
    entry_date: date
    description: str
    category: str
    amount: Decimal
    notes: str
    is_installment: bool
    frequency: InstallmentFrequency | None
    installments: list[InstallmentRead]
    created_at: datetime
    updated_at: datetime


class FinancialEntryList(BaseModel):
    items: list[FinancialEntryRead]
    total: int
