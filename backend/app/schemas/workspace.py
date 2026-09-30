from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MemberRole


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class WorkspaceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    role: MemberRole
    created_at: datetime


class InvitationCreate(BaseModel):
    expires_in_hours: int = Field(default=48, ge=1, le=168)


class InvitationRead(BaseModel):
    token: str
    expires_at: datetime


class InvitationAccept(BaseModel):
    token: str = Field(min_length=20, max_length=200)
