from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.data_transfer import import_data
from app.api.dependencies import WorkspaceAccess
from app.core.security import CurrentUser
from app.models.enums import MemberRole


def _access(role: MemberRole) -> WorkspaceAccess:
    return WorkspaceAccess(
        workspace_id=uuid4(),
        role=role,
        user=CurrentUser(id=uuid4(), email="user@example.com"),
    )


async def test_import_is_admin_only_even_in_preview_mode() -> None:
    session = AsyncMock()
    with pytest.raises(HTTPException) as error:
        await import_data(
            payload=[],
            mode="preview",
            source_type=None,
            confirm_replace=False,
            access=_access(MemberRole.MEMBER),
            session=session,
        )
    assert error.value.status_code == 403
    session.assert_not_awaited()


async def test_replace_requires_separate_confirmation() -> None:
    with pytest.raises(HTTPException) as error:
        await import_data(
            payload=[],
            mode="replace",
            source_type=None,
            confirm_replace=False,
            access=_access(MemberRole.ADMIN),
            session=AsyncMock(),
        )
    assert error.value.status_code == 409
