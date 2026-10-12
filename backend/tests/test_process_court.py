import importlib.util
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from pydantic import ValidationError

from app.models.enums import ProcessStatus
from app.models.process import Process
from app.models.workspace import Workspace
from app.schemas.process import ProcessCreate, ProcessRead, ProcessUpdate
from app.services.data_transfer import (
    _process_model,
    _process_to_import,
    export_workspace_data,
    parse_import_payload,
    process_import_key,
)


def test_court_is_editable_independently_of_process_status() -> None:
    payload = ProcessCreate(
        client="Cliente",
        court="  3º Juizado Especial Cível  ",
        status=ProcessStatus.AWAITING_OPPOSING_MANIFESTATION,
    )
    assert payload.court == "3º Juizado Especial Cível"
    assert payload.status == ProcessStatus.AWAITING_OPPOSING_MANIFESTATION
    assert ProcessUpdate(court="  2ª Vara  ").model_dump(exclude_unset=True) == {"court": "2ª Vara"}
    assert ProcessUpdate(court=None).model_dump(exclude_unset=True) == {"court": ""}
    assert "court" not in ProcessUpdate(notes="Anotação").model_dump(exclude_unset=True)
    with pytest.raises(ValidationError):
        ProcessCreate(client="Cliente", status="Juizado")
    with pytest.raises(ValidationError):
        ProcessUpdate(court="x" * 301)


@pytest.mark.parametrize(
    ("legacy", "expected_court"),
    [
        ({"status": "Juizado"}, "Juizado"),
        ({"status": "small_claims_court"}, "Juizado"),
        ({"status": " Juizado ", "juizado": "  1º Juizado  "}, "1º Juizado"),
        ({"status": "Juizado", "court": "2º Juizado"}, "2º Juizado"),
    ],
)
def test_legacy_juizado_status_moves_to_court(legacy: dict, expected_court: str) -> None:
    process = parse_import_payload({"processos": [{"cliente": "Cliente", **legacy}]}).processes[0]
    assert process.status == ProcessStatus.IN_PROGRESS
    assert process.court == expected_court


async def test_court_survives_import_orm_read_and_backup_roundtrip() -> None:
    imported = parse_import_payload(
        {
            "processes": [
                {
                    "source_id": "processflow:process:test",
                    "client": "Cliente",
                    "court": "Juizado Norte",
                    "status": "Aguardando Pagamento",
                }
            ]
        }
    ).processes[0]
    workspace_id = uuid4()
    row = _process_model(imported, workspace_id, process_import_key(imported))
    row.id = uuid4()
    row.created_at = row.updated_at = datetime.now(UTC)
    assert _process_to_import(row).court == "Juizado Norte"
    assert ProcessRead.model_validate(row).court == "Juizado Norte"

    session = AsyncMock()
    session.get.return_value = Workspace(id=workspace_id, name="Escritório")
    session.scalars.side_effect = [[row], [], []]
    backup = await export_workspace_data(session, workspace_id)
    restored = parse_import_payload(backup.model_dump(mode="json")).processes[0]
    assert restored.court == "Juizado Norte"
    assert restored.status == ProcessStatus.AWAITING_PAYMENT
    assert process_import_key(restored) == process_import_key(imported)


def test_migration_preserves_rows_and_moves_legacy_court() -> None:
    path = Path(__file__).parents[1] / "alembic/versions/20261012_0007_process_court.py"
    spec = importlib.util.spec_from_file_location("process_court_migration", path)
    assert spec is not None and spec.loader is not None
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.down_revision == "20261007_0006"

    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE processes (id INTEGER PRIMARY KEY, status VARCHAR(12) NOT NULL, "
                "notes TEXT NOT NULL)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO processes (id, status, notes) VALUES "
                "(1, 'Juizado', 'Observação original'), (2, 'Concluído', '')"
            )
        )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

        rows = connection.execute(
            sa.text("SELECT id, status, court, notes FROM processes ORDER BY id")
        ).all()
        assert rows == [
            (1, "Em andamento", "Juizado", "Observação original"),
            (2, "Concluído", "", ""),
        ]
        columns = {
            column["name"]: column for column in sa.inspect(connection).get_columns("processes")
        }
        assert columns["status"]["type"].length >= len(
            ProcessStatus.AWAITING_OPPOSING_MANIFESTATION
        )
        assert columns["court"]["nullable"] is False
        assert Process.__table__.c.status.type.length == columns["status"]["type"].length

        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        assert connection.scalar(sa.text("SELECT notes FROM processes WHERE id = 1")) == (
            "Observação original\nJuizado: Juizado"
        )
