from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import CurrentUser, get_current_user
from app.db import get_session
from app.models.enums import MemberRole
from app.models.workspace import WorkspaceMember


@dataclass(frozen=True, slots=True)
class WorkspaceAccess:
    workspace_id: UUID
    role: MemberRole
    user: CurrentUser


async def get_workspace_access(
    workspace_header: str = Header(alias="X-Workspace-ID"),
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceAccess:
    try:
        workspace_id = UUID(workspace_header)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Workspace-ID inválido.",
        ) from exc

    member = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem acesso a este espaço de trabalho.",
        )
    return WorkspaceAccess(workspace_id=workspace_id, role=member.role, user=user)
