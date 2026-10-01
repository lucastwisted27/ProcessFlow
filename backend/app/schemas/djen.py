from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DjenSubscriptionCreate(BaseModel):
    lawyer_name: str = Field(default="", max_length=200)
    oab_number: str = Field(min_length=1, max_length=30)
    oab_state: str = Field(min_length=2, max_length=2)

    @field_validator("lawyer_name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("oab_number", mode="before")
    @classmethod
    def normalize_oab(cls, value: str) -> str:
        normalized = "".join(character for character in value.upper() if character.isalnum())
        if not normalized:
            raise ValueError("Informe o número da OAB.")
        return normalized

    @field_validator("oab_state", mode="before")
    @classmethod
    def normalize_state(cls, value: str) -> str:
        return value.strip().upper()


class DjenSubscriptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    lawyer_name: str
    oab_number: str
    oab_state: str
    active: bool
    last_synced_at: datetime | None
    created_at: datetime


class DjenProcessReference(BaseModel):
    id: UUID
    client: str
    number: str


class DjenPublicationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    external_id: str
    publication_date: date
    tribunal: str
    communication_type: str
    court_body: str
    document_type: str
    medium: str
    process_number: str
    process_number_formatted: str
    content: str
    official_link: str
    recipients: list[str]
    attorneys: list[dict[str, str]]
    matched_oabs: list[str]
    is_read: bool
    process: DjenProcessReference | None
    created_at: datetime


class DjenStats(BaseModel):
    total: int
    unread: int
    today: int
    linked: int


class DjenOverview(BaseModel):
    subscriptions: list[DjenSubscriptionRead]
    publications: list[DjenPublicationRead]
    stats: DjenStats
    last_synced_at: datetime | None


class DjenSyncResult(BaseModel):
    fetched: int
    created: int
    linked: int
    warnings: list[str]


class DjenIngestRequest(BaseModel):
    subscription_id: UUID
    items: list[dict[str, Any]] = Field(max_length=1_000)


class DjenReadUpdate(BaseModel):
    is_read: bool = True
