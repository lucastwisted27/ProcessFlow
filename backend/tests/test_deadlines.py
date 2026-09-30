from datetime import date, timedelta

import pytest

from app.models.enums import ProcessStatus
from app.services.deadlines import DeadlineState, deadline_state, needs_attention

TODAY = date(2026, 9, 29)


@pytest.mark.parametrize(
    ("days", "expected"),
    [
        (-1, DeadlineState.RED),
        (0, DeadlineState.ORANGE),
        (1, DeadlineState.YELLOW),
        (3, DeadlineState.YELLOW),
        (4, DeadlineState.BLUE),
        (7, DeadlineState.BLUE),
        (8, DeadlineState.GREEN),
    ],
)
def test_deadline_thresholds(days: int, expected: DeadlineState) -> None:
    assert (
        deadline_state(TODAY + timedelta(days=days), ProcessStatus.IN_PROGRESS, TODAY) == expected
    )


def test_completed_process_is_green_even_when_overdue() -> None:
    assert (
        deadline_state(TODAY - timedelta(days=30), ProcessStatus.COMPLETED, TODAY)
        == DeadlineState.GREEN
    )


def test_process_without_deadline_is_muted() -> None:
    assert deadline_state(None, ProcessStatus.IN_PROGRESS, TODAY) == DeadlineState.MUTED


def test_attention_matches_current_rule() -> None:
    assert needs_attention(TODAY - timedelta(days=1), ProcessStatus.IN_PROGRESS, TODAY)
    assert needs_attention(TODAY + timedelta(days=3), ProcessStatus.IN_PROGRESS, TODAY)
    assert not needs_attention(TODAY + timedelta(days=4), ProcessStatus.IN_PROGRESS, TODAY)
