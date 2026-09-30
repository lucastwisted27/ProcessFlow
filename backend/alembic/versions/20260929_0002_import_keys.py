"""Chaves idempotentes para importacao de backups.

Revision ID: 20260929_0002
Revises: 20260929_0001
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260929_0002"
down_revision: str | None = "20260929_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("processes", sa.Column("import_key", sa.String(length=240), nullable=True))
    op.create_unique_constraint(
        "uq_processes_workspace_import_key",
        "processes",
        ["workspace_id", "import_key"],
    )
    op.add_column(
        "financial_entries",
        sa.Column("import_key", sa.String(length=240), nullable=True),
    )
    op.create_unique_constraint(
        "uq_financial_entries_workspace_import_key",
        "financial_entries",
        ["workspace_id", "import_key"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_financial_entries_workspace_import_key",
        "financial_entries",
        type_="unique",
    )
    op.drop_column("financial_entries", "import_key")
    op.drop_constraint(
        "uq_processes_workspace_import_key",
        "processes",
        type_="unique",
    )
    op.drop_column("processes", "import_key")
