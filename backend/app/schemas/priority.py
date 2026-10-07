from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

PriorityItemType = Literal["balcao", "inicial"]


class PriorityItemBase(BaseModel):
    item_type: PriorityItemType
    process_number: str = Field(default="", max_length=120)
    name: str = Field(min_length=1, max_length=300)
    counterparty: str = Field(default="", max_length=300)
    request_text: str = Field(default="", max_length=50_000)
    response_text: str = Field(default="", max_length=50_000)
    missing_document: bool | None = None
    notes: str = Field(default="", max_length=50_000)
    completed: bool = False

    @field_validator(
        "process_number",
        "name",
        "counterparty",
        "request_text",
        "response_text",
        "notes",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class PriorityItemCreate(PriorityItemBase):
    pass


class PriorityItemUpdate(BaseModel):
    process_number: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=300)
    counterparty: str | None = Field(default=None, max_length=300)
    request_text: str | None = Field(default=None, max_length=50_000)
    response_text: str | None = Field(default=None, max_length=50_000)
    missing_document: bool | None = None
    notes: str | None = Field(default=None, max_length=50_000)
    completed: bool | None = None

    @field_validator(
        "process_number",
        "name",
        "counterparty",
        "request_text",
        "response_text",
        "notes",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class PriorityItemRead(PriorityItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
