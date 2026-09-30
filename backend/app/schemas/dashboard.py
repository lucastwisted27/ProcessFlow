from decimal import Decimal

from pydantic import BaseModel


class DashboardProcessSummary(BaseModel):
    total: int
    in_progress: int
    critical_deadlines: int
    completed: int


class DashboardFinanceSummary(BaseModel):
    receivable: Decimal
    received: Decimal
    overdue: Decimal
    balance: Decimal


class DashboardSummary(BaseModel):
    processes: DashboardProcessSummary
    finances: DashboardFinanceSummary
