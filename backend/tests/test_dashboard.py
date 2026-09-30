from datetime import date, timedelta
from decimal import Decimal

from app.models.enums import (
    FinancialKind,
    InstallmentStatus,
    ProcessStatus,
)
from app.models.finance import FinancialEntry, Installment
from app.models.process import Process
from app.services.dashboard import build_dashboard_summary


def _process(status: ProcessStatus, due_date: date | None) -> Process:
    return Process(
        client="Cliente",
        status=status,
        due_date=due_date,
        number="",
        process_type="",
        next_action="",
        notes="",
    )


def test_dashboard_summary_matches_process_and_cash_rules() -> None:
    today = date(2026, 9, 29)
    processes = [
        _process(ProcessStatus.IN_PROGRESS, today + timedelta(days=3)),
        _process(ProcessStatus.IN_PROGRESS, today + timedelta(days=4)),
        _process(ProcessStatus.ATTENTION, today - timedelta(days=1)),
        _process(ProcessStatus.COMPLETED, today - timedelta(days=30)),
    ]

    simple_income = FinancialEntry(
        kind=FinancialKind.INCOME,
        entry_date=today,
        description="Honorários",
        category="Serviços",
        amount=Decimal("100.00"),
        notes="",
        is_installment=False,
    )
    expense = FinancialEntry(
        kind=FinancialKind.EXPENSE,
        entry_date=today,
        description="Despesa",
        category="Escritório",
        amount=Decimal("30.00"),
        notes="",
        is_installment=False,
    )
    installment_income = FinancialEntry(
        kind=FinancialKind.INCOME,
        entry_date=today,
        description="Parcelado",
        category="Serviços",
        amount=Decimal("90.00"),
        notes="",
        is_installment=True,
    )
    installment_income.installments = [
        Installment(
            number=1,
            total_installments=3,
            due_date=today - timedelta(days=30),
            received_date=today - timedelta(days=29),
            status=InstallmentStatus.RECEIVED,
            amount=Decimal("30.00"),
        ),
        Installment(
            number=2,
            total_installments=3,
            due_date=today - timedelta(days=1),
            status=InstallmentStatus.PENDING,
            amount=Decimal("30.00"),
        ),
        Installment(
            number=3,
            total_installments=3,
            due_date=today + timedelta(days=30),
            status=InstallmentStatus.PENDING,
            amount=Decimal("30.00"),
        ),
    ]

    result = build_dashboard_summary(
        processes,
        [simple_income, expense, installment_income],
        today=today,
    )

    assert result.processes.model_dump() == {
        "total": 4,
        "in_progress": 2,
        "critical_deadlines": 2,
        "completed": 1,
    }
    assert result.finances.model_dump() == {
        "receivable": Decimal("60.00"),
        "received": Decimal("130.00"),
        "overdue": Decimal("30.00"),
        "balance": Decimal("100.00"),
    }
