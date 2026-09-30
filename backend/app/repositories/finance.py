from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.finance import FinancialEntry


async def list_financial_entries(
    session: AsyncSession,
    workspace_id: UUID,
    *,
    year: int | None = None,
    month: int | None = None,
) -> tuple[list[FinancialEntry], int]:
    filters = [FinancialEntry.workspace_id == workspace_id]
    if year is not None:
        filters.append(func.extract("year", FinancialEntry.entry_date) == year)
    if month is not None:
        filters.append(func.extract("month", FinancialEntry.entry_date) == month)
    statement = (
        select(FinancialEntry)
        .options(selectinload(FinancialEntry.installments))
        .where(*filters)
        .order_by(FinancialEntry.entry_date.desc(), FinancialEntry.created_at.desc())
    )
    count_statement = select(func.count(FinancialEntry.id)).where(*filters)
    entries = list(await session.scalars(statement))
    total = int(await session.scalar(count_statement) or 0)
    return entries, total


async def get_financial_entry(
    session: AsyncSession, workspace_id: UUID, entry_id: UUID
) -> FinancialEntry | None:
    statement = (
        select(FinancialEntry)
        .options(selectinload(FinancialEntry.installments))
        .where(FinancialEntry.id == entry_id, FinancialEntry.workspace_id == workspace_id)
    )
    return await session.scalar(statement)
