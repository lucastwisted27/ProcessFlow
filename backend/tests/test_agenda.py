from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.models.enums import AgendaEventType
from app.schemas.agenda import AgendaEventCreate, AgendaEventUpdate


def test_agenda_event_accepts_optional_end_and_process() -> None:
    event = AgendaEventCreate(
        title="Audiência de conciliação",
        event_type=AgendaEventType.HEARING,
        starts_at=datetime(2026, 10, 10, 13, 0, tzinfo=UTC),
        ends_at=datetime(2026, 10, 10, 14, 0, tzinfo=UTC),
        location="Fórum",
    )

    assert event.title == "Audiência de conciliação"
    assert event.process_id is None


def test_agenda_event_rejects_end_before_start() -> None:
    with pytest.raises(ValidationError, match="horário final"):
        AgendaEventCreate(
            title="Reunião",
            starts_at=datetime(2026, 10, 10, 14, 0, tzinfo=UTC),
            ends_at=datetime(2026, 10, 10, 13, 0, tzinfo=UTC),
        )


def test_agenda_update_distinguishes_omitted_and_null_process() -> None:
    omitted = AgendaEventUpdate(title="Novo título")
    unlinked = AgendaEventUpdate(process_id=None)

    assert "process_id" not in omitted.model_dump(exclude_unset=True)
    assert unlinked.model_dump(exclude_unset=True)["process_id"] is None
