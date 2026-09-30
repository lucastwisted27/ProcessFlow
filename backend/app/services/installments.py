import calendar
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from app.models.enums import InstallmentFrequency, InstallmentStatus


def add_interval(first: date, frequency: InstallmentFrequency, index: int) -> date:
    if frequency == InstallmentFrequency.WEEKLY:
        return first + timedelta(days=7 * index)
    if frequency == InstallmentFrequency.FORTNIGHTLY:
        return first + timedelta(days=15 * index)

    month_index = first.month - 1 + index
    year = first.year + month_index // 12
    month = month_index % 12 + 1
    day = min(first.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def build_installments(
    total: Decimal,
    count: int,
    first_due_date: date,
    frequency: InstallmentFrequency,
    first_received: bool = False,
    received_on: date | None = None,
) -> list[dict]:
    amount = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    base = (amount / count).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    result: list[dict] = []
    for index in range(count):
        installment_amount = amount - base * (count - 1) if index == count - 1 else base
        is_received = index == 0 and first_received
        result.append(
            {
                "number": index + 1,
                "total_installments": count,
                "due_date": add_interval(first_due_date, frequency, index),
                "received_date": (received_on or first_due_date) if is_received else None,
                "status": (
                    InstallmentStatus.RECEIVED if is_received else InstallmentStatus.PENDING
                ),
                "amount": installment_amount,
            }
        )
    return result
