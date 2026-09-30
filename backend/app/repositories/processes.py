from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import ProcessPriority, ProcessStatus
from app.models.process import Process


def _filters(
    statement: Select,
    workspace_id: UUID,
    query: str | None,
    process_status: ProcessStatus | None,
    priority: ProcessPriority | None,
    attention: bool,
) -> Select:
    statement = statement.where(Process.workspace_id == workspace_id)
    if query:
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(
                Process.client.ilike(pattern),
                Process.number.ilike(pattern),
                Process.process_type.ilike(pattern),
                Process.next_action.ilike(pattern),
                Process.notes.ilike(pattern),
            )
        )
    if process_status:
        statement = statement.where(Process.status == process_status)
    if priority:
        statement = statement.where(Process.priority == priority)
    if attention:
        statement = statement.where(
            Process.status != ProcessStatus.COMPLETED,
            Process.due_date.is_not(None),
            Process.due_date <= date.today() + timedelta(days=3),
        )
    return statement


async def list_processes(
    session: AsyncSession,
    workspace_id: UUID,
    *,
    query: str | None = None,
    process_status: ProcessStatus | None = None,
    priority: ProcessPriority | None = None,
    attention: bool = False,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[Process], int]:
    rows_statement = _filters(
        select(Process).options(selectinload(Process.attachments)),
        workspace_id,
        query,
        process_status,
        priority,
        attention,
    ).order_by(Process.due_date.asc().nullslast(), Process.created_at.desc())
    count_statement = _filters(
        select(func.count(Process.id)),
        workspace_id,
        query,
        process_status,
        priority,
        attention,
    )

    rows = await session.scalars(rows_statement.offset(offset).limit(limit))
    total = await session.scalar(count_statement)
    return list(rows), int(total or 0)


async def get_process(
    session: AsyncSession, workspace_id: UUID, process_id: UUID
) -> Process | None:
    statement = (
        select(Process)
        .options(selectinload(Process.attachments))
        .where(Process.id == process_id, Process.workspace_id == workspace_id)
    )
    return await session.scalar(statement)
