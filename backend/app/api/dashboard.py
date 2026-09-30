from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.finance import FinancialEntry
from app.models.process import Process
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard import build_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def read_dashboard_summary(
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DashboardSummary:
    # Os dois selects são deliberadamente filtrados pelo workspace obtido do JWT + header.
    processes = list(
        await session.scalars(
            select(Process).where(Process.workspace_id == access.workspace_id)
        )
    )
    financial_entries = list(
        await session.scalars(
            select(FinancialEntry)
            .options(selectinload(FinancialEntry.installments))
            .where(FinancialEntry.workspace_id == access.workspace_id)
        )
    )
    return build_dashboard_summary(processes, financial_entries)
