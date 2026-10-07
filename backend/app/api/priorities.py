from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.priority import PriorityItem
from app.schemas.priority import PriorityItemCreate, PriorityItemRead, PriorityItemUpdate

router = APIRouter(prefix="/priorities", tags=["priorities"])


async def _get_item(
    session: AsyncSession, workspace_id: UUID, item_id: UUID
) -> PriorityItem | None:
    return await session.scalar(
        select(PriorityItem).where(
            PriorityItem.id == item_id,
            PriorityItem.workspace_id == workspace_id,
        )
    )


@router.get("", response_model=list[PriorityItemRead])
async def list_priorities(
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> list[PriorityItem]:
    return list(
        await session.scalars(
            select(PriorityItem)
            .where(PriorityItem.workspace_id == access.workspace_id)
            .order_by(PriorityItem.completed, PriorityItem.updated_at.desc())
        )
    )


@router.post("", response_model=PriorityItemRead, status_code=status.HTTP_201_CREATED)
async def create_priority(
    payload: PriorityItemCreate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> PriorityItem:
    item = PriorityItem(
        workspace_id=access.workspace_id,
        created_by=access.user.id,
        **payload.model_dump(),
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


@router.patch("/{item_id}", response_model=PriorityItemRead)
async def update_priority(
    item_id: UUID,
    payload: PriorityItemUpdate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> PriorityItem:
    item = await _get_item(session, access.workspace_id, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Prioridade não encontrada."
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await session.commit()
    await session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_priority(
    item_id: UUID,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    item = await _get_item(session, access.workspace_id, item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Prioridade não encontrada."
        )
    await session.delete(item)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
