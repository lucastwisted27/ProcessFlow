from datetime import date
from enum import StrEnum

from app.models.enums import ProcessStatus


class DeadlineState(StrEnum):
    MUTED = "muted"
    RED = "red"
    ORANGE = "orange"
    YELLOW = "yellow"
    BLUE = "blue"
    GREEN = "green"


def deadline_state(
    due_date: date | None,
    process_status: ProcessStatus,
    today: date | None = None,
) -> DeadlineState:
    if due_date is None:
        return DeadlineState.MUTED
    if process_status == ProcessStatus.COMPLETED:
        return DeadlineState.GREEN

    reference = today or date.today()
    days = (due_date - reference).days
    if days < 0:
        return DeadlineState.RED
    if days == 0:
        return DeadlineState.ORANGE
    if days <= 3:
        return DeadlineState.YELLOW
    if days <= 7:
        return DeadlineState.BLUE
    return DeadlineState.GREEN


def needs_attention(
    due_date: date | None,
    process_status: ProcessStatus,
    today: date | None = None,
) -> bool:
    return deadline_state(due_date, process_status, today) in {
        DeadlineState.RED,
        DeadlineState.ORANGE,
        DeadlineState.YELLOW,
    }
