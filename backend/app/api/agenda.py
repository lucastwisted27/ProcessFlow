from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.agenda import AgendaEvent
from app.models.enums import ProcessStatus
from app.models.process import Process
from app.schemas.agenda import (
    AgendaEventCreate,
    AgendaEventRead,
    AgendaEventUpdate,
    AgendaOverview,
    ProcessDeadlineRead,
)

router = APIRouter(prefix="/agenda", tags=["agenda"])
OFFICE_TIMEZONE = ZoneInfo("America/Manaus")


async def _get_event(
    session: AsyncSession, workspace_id: UUID, event_id: UUID
) -> AgendaEvent | None:
    return await session.scalar(
        select(AgendaEvent)
        .options(selectinload(AgendaEvent.process))
        .where(AgendaEvent.id == event_id, AgendaEvent.workspace_id == workspace_id)
    )


async def _validate_process(
    session: AsyncSession, workspace_id: UUID, process_id: UUID | None
) -> None:
    if process_id is None:
        return
    exists = await session.scalar(
        select(Process.id).where(Process.id == process_id, Process.workspace_id == workspace_id)
    )
    if exists is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="O processo selecionado não pertence a este ambiente.",
        )


@router.get("", response_model=AgendaOverview)
async def read_agenda(
    start: date = Query(...),
    end: date = Query(...),
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> AgendaOverview:
    if end < start or (end - start).days > 370:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe um período válido de até 370 dias.",
        )
    starts_at = datetime.combine(start, time.min, tzinfo=UTC)
    # O navegador envia o período em data local. A margem de um dia no final
    # inclui corretamente compromissos noturnos de fusos a oeste de UTC.
    ends_at = datetime.combine(end + timedelta(days=1), time.min, tzinfo=UTC)
    events = list(
        await session.scalars(
            select(AgendaEvent)
            .options(selectinload(AgendaEvent.process))
            .where(
                AgendaEvent.workspace_id == access.workspace_id,
                AgendaEvent.starts_at >= starts_at,
                AgendaEvent.starts_at < ends_at,
            )
            .order_by(AgendaEvent.starts_at, AgendaEvent.title)
        )
    )
    processes = list(
        await session.scalars(
            select(Process).where(
                Process.workspace_id == access.workspace_id,
                Process.status != ProcessStatus.COMPLETED,
                Process.due_date.is_not(None),
                Process.due_date >= start,
                Process.due_date <= end,
            ).order_by(Process.due_date, Process.client)
        )
    )
    overdue_processes = list(
        await session.scalars(
            select(Process).where(
                Process.workspace_id == access.workspace_id,
                Process.status != ProcessStatus.COMPLETED,
                Process.due_date.is_not(None),
                Process.due_date < datetime.now(OFFICE_TIMEZONE).date(),
            ).order_by(Process.due_date, Process.client)
        )
    )

    def deadline(item: Process) -> ProcessDeadlineRead:
        assert item.due_date is not None
        return ProcessDeadlineRead(
            id=item.id,
            client=item.client,
            number=item.number,
            due_date=datetime.combine(item.due_date, time(hour=12), tzinfo=UTC),
            next_action=item.next_action,
            priority=item.priority,
        )

    return AgendaOverview(
        events=events,
        process_deadlines=[deadline(item) for item in processes],
        overdue_deadlines=[deadline(item) for item in overdue_processes],
    )


@router.post("", response_model=AgendaEventRead, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: AgendaEventCreate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> AgendaEvent:
    await _validate_process(session, access.workspace_id, payload.process_id)
    event = AgendaEvent(
        workspace_id=access.workspace_id,
        created_by=access.user.id,
        **payload.model_dump(),
    )
    session.add(event)
    await session.commit()
    return await _get_event(session, access.workspace_id, event.id)  # type: ignore[return-value]


@router.patch("/{event_id}", response_model=AgendaEventRead)
async def update_event(
    event_id: UUID,
    payload: AgendaEventUpdate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> AgendaEvent:
    event = await _get_event(session, access.workspace_id, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento não encontrado.")
    changes = payload.model_dump(exclude_unset=True)
    if "process_id" in changes:
        await _validate_process(session, access.workspace_id, changes["process_id"])
    starts_at = changes.get("starts_at", event.starts_at)
    ends_at = changes.get("ends_at", event.ends_at)
    if ends_at is not None and ends_at < starts_at:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="O horário final não pode ser anterior ao início.",
        )
    for field, value in changes.items():
        setattr(event, field, value)
    await session.commit()
    return await _get_event(session, access.workspace_id, event.id)  # type: ignore[return-value]


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    event = await _get_event(session, access.workspace_id, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento não encontrado.")
    await session.delete(event)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
