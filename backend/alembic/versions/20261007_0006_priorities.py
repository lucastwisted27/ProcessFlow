"""Quadros compartilhados de prioridades.

Revision ID: 20261007_0006
Revises: 20261001_0005
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261007_0006"
down_revision: str | None = "20261001_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "priority_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("process_number", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("counterparty", sa.String(length=300), nullable=False),
        sa.Column("request_text", sa.Text(), nullable=False),
        sa.Column("response_text", sa.Text(), nullable=False),
        sa.Column("missing_document", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
            name=op.f("fk_priority_items_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_priority_items")),
    )
    op.create_index(op.f("ix_priority_items_completed"), "priority_items", ["completed"])
    op.create_index(op.f("ix_priority_items_item_type"), "priority_items", ["item_type"])
    op.create_index(op.f("ix_priority_items_workspace_id"), "priority_items", ["workspace_id"])
    op.create_index(
        "ix_priority_items_workspace_type_completed",
        "priority_items",
        ["workspace_id", "item_type", "completed"],
    )


def downgrade() -> None:
    op.drop_table("priority_items")
