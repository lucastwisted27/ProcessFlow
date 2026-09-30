from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.enums import MemberRole
from app.schemas.data_transfer import (
    DataExport,
    DataImportReport,
    ImportMode,
    ImportSourceType,
)
from app.services.data_transfer import (
    ImportPayloadError,
    export_workspace_data,
    import_workspace_data,
    parse_import_payload,
)

router = APIRouter(prefix="/data", tags=["data-transfer"])


@router.get("/export", response_model=DataExport)
async def export_data(
    response: Response,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DataExport:
    response.headers["Content-Disposition"] = (
        'attachment; filename="processflow-backup.json"'
    )
    try:
        return await export_workspace_data(session, access.workspace_id)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Espaço não encontrado."
        ) from exc


@router.post("/import", response_model=DataImportReport)
async def import_data(
    payload: Any = Body(...),
    mode: ImportMode = Query(default="preview"),
    source_type: ImportSourceType | None = Query(default=None),
    confirm_replace: bool = Query(default=False),
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DataImportReport:
    if access.role != MemberRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Somente administradores podem importar dados.",
        )
    if mode == "replace" and not confirm_replace:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A substituição apaga os processos e lançamentos deste espaço. "
                "Repita com confirm_replace=true após revisar a prévia."
            ),
        )
    try:
        bundle = parse_import_payload(payload, source_type=source_type)
    except ImportPayloadError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": exc.message, "errors": exc.errors},
        ) from exc
    return await import_workspace_data(
        session,
        access.workspace_id,
        bundle,
        mode=mode,
    )
