from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from app.models.enums import ProcessPriority, ProcessStatus


class AttachmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    url: HttpUrl


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    url: str


class ProcessBase(BaseModel):
    client: str = Field(min_length=1, max_length=300)
    number: str = Field(default="", max_length=120)
    process_type: str = Field(default="", max_length=200)
    due_date: date | None = None
    next_action: str = Field(default="", max_length=300)
    priority: ProcessPriority = ProcessPriority.NORMAL
    status: ProcessStatus = ProcessStatus.IN_PROGRESS
    notes: str = ""

    @field_validator("client", "number", "process_type", "next_action", mode="before")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class ProcessCreate(ProcessBase):
    attachments: list[AttachmentCreate] = Field(default_factory=list)


class ProcessUpdate(BaseModel):
    client: str | None = Field(default=None, min_length=1, max_length=300)
    number: str | None = Field(default=None, max_length=120)
    process_type: str | None = Field(default=None, max_length=200)
    due_date: date | None = None
    next_action: str | None = Field(default=None, max_length=300)
    priority: ProcessPriority | None = None
    status: ProcessStatus | None = None
    notes: str | None = None


class ProcessRead(ProcessBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    legacy_id: int | None
    origin: str
    trello_id: str | None
    trello_url: str | None
    attachments: list[AttachmentRead]
    created_at: datetime
    updated_at: datetime


class ProcessList(BaseModel):
    items: list[ProcessRead]
    total: int
    offset: int
    limit: int
