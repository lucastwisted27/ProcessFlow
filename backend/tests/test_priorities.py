from app.schemas.priority import PriorityItemCreate, PriorityItemUpdate


def test_priority_create_strips_spreadsheet_fields() -> None:
    item = PriorityItemCreate(
        item_type="balcao",
        process_number="  0237598-52.2025.8.04.1000  ",
        name="  Samanta Evangelista  ",
        request_text="  Pedido de majoração de multa  ",
    )

    assert item.process_number == "0237598-52.2025.8.04.1000"
    assert item.name == "Samanta Evangelista"
    assert item.request_text == "Pedido de majoração de multa"


def test_priority_update_accepts_completion_and_missing_document() -> None:
    update = PriorityItemUpdate(completed=True, missing_document=False)

    assert update.completed is True
    assert update.missing_document is False
