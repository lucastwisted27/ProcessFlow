"""Publicações do Diário de Justiça Eletrônico Nacional.

Revision ID: 20261001_0004
Revises: 20261001_0003
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261001_0004"
down_revision: str | None = "20261001_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "djen_subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("lawyer_name", sa.String(length=200), nullable=False),
        sa.Column("oab_number", sa.String(length=30), nullable=False),
        sa.Column("oab_state", sa.String(length=2), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
            name=op.f("fk_djen_subscriptions_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_djen_subscriptions")),
        sa.UniqueConstraint(
            "workspace_id", "oab_number", "oab_state", name="uq_djen_subscription_oab"
        ),
    )
    op.create_index(
        op.f("ix_djen_subscriptions_workspace_id"),
        "djen_subscriptions",
        ["workspace_id"],
    )
    op.create_table(
        "djen_publications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("process_id", sa.Uuid(), nullable=True),
        sa.Column("external_id", sa.String(length=50), nullable=False),
        sa.Column("publication_hash", sa.String(length=100), nullable=False),
        sa.Column("publication_date", sa.Date(), nullable=False),
        sa.Column("tribunal", sa.String(length=40), nullable=False),
        sa.Column("communication_type", sa.String(length=100), nullable=False),
        sa.Column("court_body", sa.String(length=500), nullable=False),
        sa.Column("document_type", sa.String(length=200), nullable=False),
        sa.Column("medium", sa.String(length=100), nullable=False),
        sa.Column("process_number", sa.String(length=50), nullable=False),
        sa.Column("process_number_formatted", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("official_link", sa.Text(), nullable=False),
        sa.Column("recipients", sa.JSON(), nullable=False),
        sa.Column("attorneys", sa.JSON(), nullable=False),
        sa.Column("matched_oabs", sa.JSON(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["process_id"],
            ["processes.id"],
            ondelete="SET NULL",
            name=op.f("fk_djen_publications_process_id_processes"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="CASCADE",
            name=op.f("fk_djen_publications_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_djen_publications")),
        sa.UniqueConstraint("workspace_id", "external_id", name="uq_djen_publication_external"),
    )
    op.create_index(
        op.f("ix_djen_publications_workspace_id"),
        "djen_publications",
        ["workspace_id"],
    )
    op.create_index(op.f("ix_djen_publications_process_id"), "djen_publications", ["process_id"])
    op.create_index(
        op.f("ix_djen_publications_publication_date"),
        "djen_publications",
        ["publication_date"],
    )
    op.create_index(op.f("ix_djen_publications_is_read"), "djen_publications", ["is_read"])
    op.create_index(
        "ix_djen_publications_workspace_date",
        "djen_publications",
        ["workspace_id", "publication_date"],
    )


def downgrade() -> None:
    op.drop_table("djen_publications")
    op.drop_table("djen_subscriptions")
