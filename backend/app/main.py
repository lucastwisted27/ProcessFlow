from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agenda import router as agenda_router
from app.api.dashboard import router as dashboard_router
from app.api.data_transfer import router as data_transfer_router
from app.api.djen import router as djen_router
from app.api.finance import router as finance_router
from app.api.priorities import router as priorities_router
from app.api.processes import router as processes_router
from app.api.workspaces import router as workspaces_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Workspace-ID"],
)

app.include_router(workspaces_router, prefix="/api/v1")
app.include_router(processes_router, prefix="/api/v1")
app.include_router(priorities_router, prefix="/api/v1")
app.include_router(finance_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(data_transfer_router, prefix="/api/v1")
app.include_router(agenda_router, prefix="/api/v1")
app.include_router(djen_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "version": settings.app_version,
        "database_configured": bool(settings.database_connection_url),
        "auth_configured": bool(settings.supabase_url),
    }
