"""Agenda compartilhada de audiências e compromissos.

Revision ID: 20261001_0003
Revises: 20260929_0002
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261001_0003"
down_revision: str | None = "20260929_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

event_type = sa.Enum(
    "Audiência", "Reunião", "Compromisso", "Lembrete", name="agendaeventtype", native_enum=False
)
event_status = sa.Enum(
    "agendado", "concluído", "cancelado", name="agendaeventstatus", native_enum=False
)


def upgrade() -> None:
    op.create_table(
        "agenda_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("process_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("event_type", event_type, nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("status", event_status, nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("import_key", sa.String(length=240), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["process_id"], ["processes.id"], ondelete="SET NULL",
            name=op.f("fk_agenda_events_process_id_processes"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["workspaces.id"], ondelete="CASCADE",
            name=op.f("fk_agenda_events_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_agenda_events")),
        sa.UniqueConstraint(
            "workspace_id", "import_key", name="uq_agenda_events_workspace_import_key"
        ),
    )
    op.create_index(op.f("ix_agenda_events_process_id"), "agenda_events", ["process_id"])
    op.create_index(op.f("ix_agenda_events_starts_at"), "agenda_events", ["starts_at"])
    op.create_index(op.f("ix_agenda_events_status"), "agenda_events", ["status"])
    op.create_index(op.f("ix_agenda_events_workspace_id"), "agenda_events", ["workspace_id"])
    op.create_index(
        "ix_agenda_events_workspace_starts", "agenda_events", ["workspace_id", "starts_at"]
    )


def downgrade() -> None:
    op.drop_table("agenda_events")
