from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.enums import ProcessPriority, ProcessStatus
from app.models.process import Process, ProcessAttachment
from app.repositories.processes import get_process, list_processes
from app.schemas.process import ProcessCreate, ProcessList, ProcessRead, ProcessUpdate

router = APIRouter(prefix="/processes", tags=["processes"])


@router.get("", response_model=ProcessList)
async def read_processes(
    q: str | None = Query(default=None, max_length=200),
    process_status: ProcessStatus | None = Query(default=None, alias="status"),
    priority: ProcessPriority | None = None,
    attention: bool = False,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> ProcessList:
    items, total = await list_processes(
        session,
        access.workspace_id,
        query=q,
        process_status=process_status,
        priority=priority,
        attention=attention,
        offset=offset,
        limit=limit,
    )
    return ProcessList(items=items, total=total, offset=offset, limit=limit)


@router.post("", response_model=ProcessRead, status_code=status.HTTP_201_CREATED)
async def create_process(
    payload: ProcessCreate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Process:
    values = payload.model_dump(exclude={"attachments"})
    process = Process(workspace_id=access.workspace_id, **values)
    process.attachments = [
        ProcessAttachment(name=item.name, url=str(item.url)) for item in payload.attachments
    ]
    session.add(process)
    await session.commit()
    return await get_process(session, access.workspace_id, process.id)  # type: ignore[return-value]


@router.get("/{process_id}", response_model=ProcessRead)
async def read_process(
    process_id: UUID,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Process:
    process = await get_process(session, access.workspace_id, process_id)
    if process is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado."
        )
    return process


@router.patch("/{process_id}", response_model=ProcessRead)
async def update_process(
    process_id: UUID,
    payload: ProcessUpdate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Process:
    process = await get_process(session, access.workspace_id, process_id)
    if process is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado."
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(process, field, value)
    await session.commit()
    return await get_process(session, access.workspace_id, process_id)  # type: ignore[return-value]


@router.delete("/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_process(
    process_id: UUID,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    process = await get_process(session, access.workspace_id, process_id)
    if process is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado."
        )
    await session.delete(process)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
