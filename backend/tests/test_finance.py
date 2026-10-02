from datetime import date
from decimal import Decimal

from app.models.enums import FinancialKind, InstallmentStatus
from app.schemas.finance import FinancialEntryUpdate, InstallmentUpdate


def test_financial_update_strips_editable_text() -> None:
    update = FinancialEntryUpdate(
        kind=FinancialKind.EXPENSE,
        description="  Custas judiciais  ",
        category="  Processo  ",
        notes="  Pago no balcão  ",
        amount=Decimal("125.50"),
    )

    assert update.description == "Custas judiciais"
    assert update.category == "Processo"
    assert update.notes == "Pago no balcão"
    assert update.amount == Decimal("125.50")


def test_installment_update_accepts_status_date_and_amount() -> None:
    update = InstallmentUpdate(
        status=InstallmentStatus.RECEIVED,
        due_date=date(2026, 10, 15),
        amount=Decimal("250.00"),
    )

    assert update.status == InstallmentStatus.RECEIVED
    assert update.due_date == date(2026, 10, 15)
    assert update.amount == Decimal("250.00")
