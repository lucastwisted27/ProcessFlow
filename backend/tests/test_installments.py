from datetime import date
from decimal import Decimal

from app.models.enums import InstallmentFrequency, InstallmentStatus
from app.services.installments import add_interval, build_installments


def test_monthly_interval_uses_last_day_when_needed() -> None:
    first = date(2026, 1, 31)
    assert add_interval(first, InstallmentFrequency.MONTHLY, 1) == date(2026, 2, 28)
    assert add_interval(first, InstallmentFrequency.MONTHLY, 2) == date(2026, 3, 31)


def test_installment_rounding_keeps_exact_total() -> None:
    items = build_installments(
        Decimal("100.00"), 3, date(2026, 1, 10), InstallmentFrequency.MONTHLY
    )
    assert [item["amount"] for item in items] == [
        Decimal("33.33"),
        Decimal("33.33"),
        Decimal("33.34"),
    ]
    assert sum(item["amount"] for item in items) == Decimal("100.00")


def test_only_first_installment_can_start_received() -> None:
    items = build_installments(
        Decimal("50.00"),
        2,
        date(2026, 9, 29),
        InstallmentFrequency.FORTNIGHTLY,
        first_received=True,
        received_on=date(2026, 9, 29),
    )
    assert items[0]["status"] == InstallmentStatus.RECEIVED
    assert items[1]["status"] == InstallmentStatus.PENDING
