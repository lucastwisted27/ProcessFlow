"""Juizado como campo independente e espaço para novos status.

Revision ID: 20261012_0007
Revises: 20261007_0006
Create Date: 2026-10-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261012_0007"
down_revision: str | None = "20261007_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("processes") as batch:
        batch.add_column(sa.Column("court", sa.String(300), server_default="", nullable=False))
        batch.alter_column(
            "status", existing_type=sa.String(12), type_=sa.String(50), existing_nullable=False
        )
    op.execute(
        sa.text(
            "UPDATE processes SET court = 'Juizado', status = 'Em andamento' "
            "WHERE status = 'Juizado'"
        )
    )


def downgrade() -> None:
    # Preserve the editable court in notes when reverting to a schema without this field.
    op.execute(
        sa.text(
            "UPDATE processes SET notes = CASE WHEN COALESCE(notes, '') = '' "
            "THEN 'Juizado: ' || court ELSE notes || '\nJuizado: ' || court END "
            "WHERE court <> ''"
        )
    )
    with op.batch_alter_table("processes") as batch:
        batch.drop_column("court")
    # Keep VARCHAR(50): shrinking it could truncate the longer existing status values.
