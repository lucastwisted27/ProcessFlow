from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import AgendaEventStatus, AgendaEventType, ProcessPriority


class AgendaEventBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    event_type: AgendaEventType = AgendaEventType.COMMITMENT
    starts_at: datetime
    ends_at: datetime | None = None
    process_id: UUID | None = None
    location: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=50_000)

    @field_validator("title", "location", "notes", mode="before")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_period(self) -> "AgendaEventBase":
        if self.ends_at is not None and self.ends_at < self.starts_at:
            raise ValueError("O horário final não pode ser anterior ao início.")
        return self


class AgendaEventCreate(AgendaEventBase):
    pass


class AgendaEventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    event_type: AgendaEventType | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    process_id: UUID | None = None
    location: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=50_000)
    status: AgendaEventStatus | None = None

    @field_validator("title", "location", "notes", mode="before")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value


class AgendaProcessReference(BaseModel):
    id: UUID
    client: str
    number: str


class AgendaEventRead(AgendaEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: AgendaEventStatus
    process: AgendaProcessReference | None
    created_at: datetime
    updated_at: datetime


class ProcessDeadlineRead(BaseModel):
    id: UUID
    client: str
    number: str
    due_date: datetime
    next_action: str
    priority: ProcessPriority


class AgendaOverview(BaseModel):
    events: list[AgendaEventRead]
    process_deadlines: list[ProcessDeadlineRead]
