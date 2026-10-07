from datetime import date, timedelta
from decimal import Decimal

from app.models.enums import FinancialKind, InstallmentStatus, ProcessStatus
from app.models.finance import FinancialEntry
from app.models.process import Process
from app.schemas.dashboard import (
    DashboardFinanceSummary,
    DashboardProcessSummary,
    DashboardSummary,
)

ZERO = Decimal("0.00")


def build_dashboard_summary(
    processes: list[Process],
    financial_entries: list[FinancialEntry],
    *,
    today: date | None = None,
) -> DashboardSummary:
    """Calcula o painel sem misturar workspaces.

    O chamador entrega apenas registros já filtrados pelo workspace autenticado.
    Receitas simples contam como recebidas na data do lançamento; receitas parceladas
    contam somente as parcelas marcadas como recebidas. Despesas entram no saldo no
    momento em que foram registradas, seguindo o comportamento do app legado.
    """

    current_day = today or date.today()
    critical_limit = current_day + timedelta(days=3)

    process_summary = DashboardProcessSummary(
        total=len(processes),
        in_progress=sum(item.status == ProcessStatus.IN_PROGRESS for item in processes),
        stayed=sum(item.status == ProcessStatus.STAYED for item in processes),
        awaiting_payment=sum(
            item.status == ProcessStatus.AWAITING_PAYMENT for item in processes
        ),
        awaiting_opposing_manifestation=sum(
            item.status == ProcessStatus.AWAITING_OPPOSING_MANIFESTATION
            for item in processes
        ),
        decision_acknowledgment=sum(
            item.status == ProcessStatus.DECISION_ACKNOWLEDGMENT for item in processes
        ),
        critical_deadlines=sum(
            item.status != ProcessStatus.COMPLETED
            and item.due_date is not None
            and item.due_date <= critical_limit
            for item in processes
        ),
        completed=sum(item.status == ProcessStatus.COMPLETED for item in processes),
    )

    received = ZERO
    receivable = ZERO
    overdue = ZERO
    expenses = ZERO
    for entry in financial_entries:
        if entry.kind == FinancialKind.EXPENSE:
            expenses += entry.amount
            continue
        if not entry.is_installment:
            received += entry.amount
            continue
        for installment in entry.installments:
            if installment.status == InstallmentStatus.RECEIVED:
                received += installment.amount
            else:
                receivable += installment.amount
                if installment.due_date < current_day:
                    overdue += installment.amount

    return DashboardSummary(
        processes=process_summary,
        finances=DashboardFinanceSummary(
            receivable=receivable,
            received=received,
            overdue=overdue,
            balance=received - expenses,
        ),
    )
