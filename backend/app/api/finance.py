from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.enums import FinancialKind, InstallmentFrequency, InstallmentStatus
from app.models.finance import FinancialEntry, Installment
from app.repositories.finance import get_financial_entry, list_financial_entries
from app.schemas.finance import (
    FinancialEntryCreate,
    FinancialEntryList,
    FinancialEntryRead,
    FinancialEntryUpdate,
    InstallmentUpdate,
)
from app.services.installments import build_installments

router = APIRouter(prefix="/financial-entries", tags=["finance"])


@router.get("", response_model=FinancialEntryList)
async def read_financial_entries(
    year: int | None = Query(default=None, ge=2000, le=2200),
    month: int | None = Query(default=None, ge=1, le=12),
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> FinancialEntryList:
    entries, total = await list_financial_entries(
        session, access.workspace_id, year=year, month=month
    )
    return FinancialEntryList(items=entries, total=total)


@router.post("", response_model=FinancialEntryRead, status_code=status.HTTP_201_CREATED)
async def create_financial_entry(
    payload: FinancialEntryCreate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> FinancialEntry:
    entry = FinancialEntry(
        workspace_id=access.workspace_id,
        kind=payload.kind,
        entry_date=payload.entry_date,
        description=payload.description.strip(),
        category=payload.category.strip(),
        amount=payload.amount,
        notes=payload.notes.strip(),
        is_installment=payload.is_installment,
        frequency=payload.frequency if payload.is_installment else None,
    )
    if payload.is_installment:
        assert payload.installment_count is not None
        assert payload.first_due_date is not None
        assert payload.frequency is not None
        entry.installments = [
            Installment(**item)
            for item in build_installments(
                payload.amount,
                payload.installment_count,
                payload.first_due_date,
                payload.frequency,
                payload.first_received,
                received_on=date.today(),
            )
        ]
    session.add(entry)
    await session.commit()
    return await get_financial_entry(session, access.workspace_id, entry.id)  # type: ignore[return-value]


@router.patch("/{entry_id}", response_model=FinancialEntryRead)
async def update_financial_entry(
    entry_id: UUID,
    payload: FinancialEntryUpdate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> FinancialEntry:
    entry = await get_financial_entry(session, access.workspace_id, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado."
        )
    changes = payload.model_dump(exclude_unset=True)
    if entry.is_installment and changes.get("kind", FinancialKind.INCOME) != FinancialKind.INCOME:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Um recebimento parcelado deve permanecer como receita.",
        )
    new_amount = changes.pop("amount", None)
    for field, value in changes.items():
        setattr(entry, field, value)
    if new_amount is not None:
        entry.amount = new_amount
        if entry.is_installment and entry.installments:
            ordered = sorted(entry.installments, key=lambda item: item.number)
            first_due_date = ordered[0].due_date
            frequency = entry.frequency or InstallmentFrequency.MONTHLY
            rebuilt = build_installments(new_amount, len(ordered), first_due_date, frequency)
            for installment, values in zip(ordered, rebuilt, strict=True):
                installment.amount = values["amount"]
    await session.commit()
    return await get_financial_entry(session, access.workspace_id, entry.id)  # type: ignore[return-value]


@router.post(
    "/{entry_id}/installments/{number}/receive",
    response_model=FinancialEntryRead,
)
async def receive_installment(
    entry_id: UUID,
    number: int,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> FinancialEntry:
    entry = await get_financial_entry(session, access.workspace_id, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado."
        )
    installment = next((item for item in entry.installments if item.number == number), None)
    if installment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcela não encontrada.")
    if installment.status != InstallmentStatus.RECEIVED:
        installment.status = InstallmentStatus.RECEIVED
        installment.received_date = date.today()
        await session.commit()
    return await get_financial_entry(session, access.workspace_id, entry_id)  # type: ignore[return-value]


@router.patch(
    "/{entry_id}/installments/{number}",
    response_model=FinancialEntryRead,
)
async def update_installment(
    entry_id: UUID,
    number: int,
    payload: InstallmentUpdate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> FinancialEntry:
    entry = await get_financial_entry(session, access.workspace_id, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado."
        )
    installment = next((item for item in entry.installments if item.number == number), None)
    if installment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parcela não encontrada.")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(installment, field, value)
    if "status" in changes:
        installment.received_date = (
            date.today() if changes["status"] == InstallmentStatus.RECEIVED else None
        )
    if "amount" in changes:
        entry.amount = sum((item.amount for item in entry.installments), start=0)
    await session.commit()
    return await get_financial_entry(session, access.workspace_id, entry_id)  # type: ignore[return-value]


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_financial_entry(
    entry_id: UUID,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    entry = await get_financial_entry(session, access.workspace_id, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento não encontrado."
        )
    await session.delete(entry)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
