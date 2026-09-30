from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.core.security import CurrentUser, get_current_user
from app.db import get_session
from app.models.enums import MemberRole
from app.models.workspace import Workspace, WorkspaceInvitation, WorkspaceMember
from app.schemas.workspace import (
    InvitationAccept,
    InvitationCreate,
    InvitationRead,
    WorkspaceCreate,
    WorkspaceRead,
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceRead])
async def list_workspaces(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[WorkspaceRead]:
    statement = (
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
        .order_by(Workspace.name)
    )
    rows = (await session.execute(statement)).all()
    return [
        WorkspaceRead(
            id=workspace.id, name=workspace.name, role=role, created_at=workspace.created_at
        )
        for workspace, role in rows
    ]


@router.post("", response_model=WorkspaceRead, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceRead:
    workspace = Workspace(name=payload.name.strip())
    session.add(workspace)
    await session.flush()
    session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            user_id=user.id,
            role=MemberRole.ADMIN,
        )
    )
    await session.commit()
    await session.refresh(workspace)
    return WorkspaceRead(
        id=workspace.id,
        name=workspace.name,
        role=MemberRole.ADMIN,
        created_at=workspace.created_at,
    )


@router.post(
    "/{workspace_id}/invitations",
    response_model=InvitationRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    workspace_id: UUID,
    payload: InvitationCreate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> InvitationRead:
    if access.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace divergente.")
    if access.role != MemberRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente administradores podem convidar usuários.",
        )

    raw_token = token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=payload.expires_in_hours)
    invitation = WorkspaceInvitation(
        workspace_id=workspace_id,
        token_hash=sha256(raw_token.encode()).hexdigest(),
        role=MemberRole.MEMBER,
        expires_at=expires_at,
        created_by=access.user.id,
    )
    session.add(invitation)
    await session.commit()
    return InvitationRead(token=raw_token, expires_at=expires_at)


@router.post("/invitations/accept", response_model=WorkspaceRead)
async def accept_invitation(
    payload: InvitationAccept,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WorkspaceRead:
    token_hash = sha256(payload.token.strip().encode()).hexdigest()
    invitation = await session.scalar(
        select(WorkspaceInvitation).where(WorkspaceInvitation.token_hash == token_hash)
    )
    now = datetime.now(UTC)
    if invitation is None or invitation.claimed_at is not None or invitation.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Convite inválido, expirado ou já utilizado.",
        )

    workspace = await session.get(Workspace, invitation.workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Espaço não encontrado.")

    member = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == invitation.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if member is None:
        member = WorkspaceMember(
            workspace_id=invitation.workspace_id,
            user_id=user.id,
            role=invitation.role,
        )
        session.add(member)

    invitation.claimed_at = now
    invitation.claimed_by = user.id
    await session.commit()
    await session.refresh(workspace)
    return WorkspaceRead(
        id=workspace.id,
        name=workspace.name,
        role=member.role,
        created_at=workspace.created_at,
    )
