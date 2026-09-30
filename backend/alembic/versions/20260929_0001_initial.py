"""Modelo inicial multiusuário do ProcessFlow.

Revision ID: 20260929_0001
Revises: None
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260929_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

member_role = sa.Enum("admin", "member", name="memberrole", native_enum=False)
process_priority = sa.Enum(
    "Baixa", "Normal", "Alta", "Urgente", name="processpriority", native_enum=False
)
process_status = sa.Enum(
    "Em andamento", "Atenção", "Sobrestado", "Concluído", name="processstatus", native_enum=False
)
financial_kind = sa.Enum("receita", "despesa", name="financialkind", native_enum=False)
installment_frequency = sa.Enum(
    "semanal", "quinzenal", "mensal", name="installmentfrequency", native_enum=False
)
installment_status = sa.Enum("pendente", "recebida", name="installmentstatus", native_enum=False)


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        *timestamps(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspaces")),
    )
    op.create_table(
        "workspace_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", member_role, nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_workspace_members_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspace_members")),
        sa.UniqueConstraint(
            "workspace_id", "user_id", name=op.f("uq_workspace_members_workspace_id")
        ),
    )
    op.create_index(op.f("ix_workspace_members_user_id"), "workspace_members", ["user_id"])
    op.create_index(
        op.f("ix_workspace_members_workspace_id"), "workspace_members", ["workspace_id"]
    )

    op.create_table(
        "workspace_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("role", member_role, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("claimed_by", sa.Uuid(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_workspace_invitations_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_workspace_invitations")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_workspace_invitations_token_hash")),
    )
    op.create_index(
        op.f("ix_workspace_invitations_token_hash"),
        "workspace_invitations",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        op.f("ix_workspace_invitations_workspace_id"), "workspace_invitations", ["workspace_id"]
    )

    op.create_table(
        "processes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("legacy_id", sa.Integer(), nullable=True),
        sa.Column("client", sa.String(length=300), nullable=False),
        sa.Column("number", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=200), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("next_action", sa.String(length=300), nullable=False),
        sa.Column("priority", process_priority, nullable=False),
        sa.Column("status", process_status, nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("origin", sa.String(length=50), nullable=False),
        sa.Column("trello_id", sa.String(length=100), nullable=True),
        sa.Column("trello_url", sa.Text(), nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_processes_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_processes")),
        sa.UniqueConstraint("workspace_id", "trello_id", name=op.f("uq_processes_workspace_id")),
    )
    op.create_index(op.f("ix_processes_due_date"), "processes", ["due_date"])
    op.create_index(op.f("ix_processes_status"), "processes", ["status"])
    op.create_index(op.f("ix_processes_workspace_id"), "processes", ["workspace_id"])
    op.create_index(
        "ix_processes_workspace_status_due", "processes", ["workspace_id", "status", "due_date"]
    )
    op.create_table(
        "process_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("process_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=500), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["process_id"],
            ["processes.id"],
            name=op.f("fk_process_attachments_process_id_processes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_process_attachments")),
    )
    op.create_index(
        op.f("ix_process_attachments_process_id"), "process_attachments", ["process_id"]
    )

    op.create_table(
        "financial_entries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("legacy_id", sa.Integer(), nullable=True),
        sa.Column("kind", financial_kind, nullable=False),
        sa.Column("entry_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("is_installment", sa.Boolean(), nullable=False),
        sa.Column("frequency", installment_frequency, nullable=True),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_financial_entries_workspace_id_workspaces"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_entries")),
    )
    op.create_index(op.f("ix_financial_entries_entry_date"), "financial_entries", ["entry_date"])
    op.create_index(
        op.f("ix_financial_entries_workspace_id"), "financial_entries", ["workspace_id"]
    )
    op.create_table(
        "installments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("financial_entry_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("total_installments", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("received_date", sa.Date(), nullable=True),
        sa.Column("status", installment_status, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        *timestamps(),
        sa.ForeignKeyConstraint(
            ["financial_entry_id"],
            ["financial_entries.id"],
            name=op.f("fk_installments_financial_entry_id_financial_entries"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_installments")),
        sa.UniqueConstraint(
            "financial_entry_id", "number", name=op.f("uq_installments_financial_entry_id")
        ),
    )
    op.create_index(op.f("ix_installments_due_date"), "installments", ["due_date"])
    op.create_index(
        op.f("ix_installments_financial_entry_id"), "installments", ["financial_entry_id"]
    )


def downgrade() -> None:
    op.drop_table("installments")
    op.drop_table("financial_entries")
    op.drop_table("process_attachments")
    op.drop_table("processes")
    op.drop_table("workspace_invitations")
    op.drop_table("workspace_members")
    op.drop_table("workspaces")
