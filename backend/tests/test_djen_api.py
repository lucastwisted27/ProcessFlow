from datetime import UTC, date, datetime
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.api.djen import router
from app.core.security import CurrentUser
from app.db import get_session
from app.models.djen import DjenPublication, DjenSubscription
from app.models.enums import MemberRole
from app.models.process import Process


def test_djen_overview_serializes_publication_linked_to_process() -> None:
    workspace_id = uuid4()
    timestamp = datetime(2026, 10, 12, 12, tzinfo=UTC)
    process = Process(id=uuid4(), client="Cliente Teste", number="0456981-90.2023.8.04.0001")
    subscription = DjenSubscription(
        id=uuid4(), workspace_id=workspace_id, lawyer_name="Advogado Teste",
        oab_number="12345", oab_state="AM", active=True,
        last_synced_at=timestamp, created_at=timestamp,
    )
    publication = DjenPublication(
        id=uuid4(), workspace_id=workspace_id, external_id="test-publication",
        publication_date=date(2026, 10, 12), tribunal="TJAM",
        communication_type="Intimação", court_body="Vara Cível", document_type="Despacho",
        medium="DJEN", process_number="04569819020238040001",
        process_number_formatted=process.number, content_preview="Publicação de teste",
        matched_oabs=["AM 12345"], is_read=False, process=process, process_id=process.id,
        created_at=timestamp,
    )
    session = AsyncMock()
    session.scalars.side_effect = [[subscription], [publication]]
    session.execute.return_value = Mock(one=Mock(return_value=(1, 1, 1, 1)))
    access = WorkspaceAccess(
        workspace_id=workspace_id, role=MemberRole.MEMBER,
        user=CurrentUser(id=uuid4(), email="test@example.com"),
    )

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_workspace_access] = lambda: access

    with TestClient(app) as client:
        response = client.get("/api/v1/djen")

    assert response.status_code == 200
    payload = response.json()
    assert payload["subscriptions"][0]["oab_number"] == "12345"
    assert payload["publications"][0]["process"] == {
        "id": str(process.id), "client": "Cliente Teste", "number": process.number,
    }
    assert payload["stats"] == {"total": 1, "unread": 1, "today": 1, "linked": 1}
