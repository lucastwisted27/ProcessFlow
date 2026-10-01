from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import WorkspaceAccess, get_workspace_access
from app.db import get_session
from app.models.djen import DjenPublication, DjenSubscription
from app.models.process import Process
from app.schemas.djen import (
    DjenOverview,
    DjenPublicationRead,
    DjenReadUpdate,
    DjenStats,
    DjenSubscriptionCreate,
    DjenSubscriptionRead,
    DjenSyncResult,
)
from app.services.djen import fetch_djen_publications, html_to_text, normalize_process_number

router = APIRouter(prefix="/djen", tags=["djen"])
OFFICE_TIMEZONE = ZoneInfo("America/Manaus")


async def _overview(
    session: AsyncSession,
    workspace_id: UUID,
    *,
    search: str = "",
    unread_only: bool = False,
    linked_only: bool = False,
) -> DjenOverview:
    subscriptions = list(
        await session.scalars(
            select(DjenSubscription)
            .where(DjenSubscription.workspace_id == workspace_id)
            .order_by(DjenSubscription.lawyer_name, DjenSubscription.oab_state)
        )
    )
    statement = (
        select(DjenPublication)
        .options(selectinload(DjenPublication.process))
        .where(DjenPublication.workspace_id == workspace_id)
    )
    if search:
        term = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                DjenPublication.content.ilike(term),
                DjenPublication.process_number_formatted.ilike(term),
                DjenPublication.tribunal.ilike(term),
                DjenPublication.court_body.ilike(term),
            )
        )
    if unread_only:
        statement = statement.where(DjenPublication.is_read.is_(False))
    if linked_only:
        statement = statement.where(DjenPublication.process_id.is_not(None))
    publications = list(
        await session.scalars(
            statement.order_by(
                DjenPublication.publication_date.desc(), DjenPublication.created_at.desc()
            ).limit(300)
        )
    )
    today = datetime.now(OFFICE_TIMEZONE).date()
    total = await session.scalar(
        select(func.count()).select_from(DjenPublication).where(
            DjenPublication.workspace_id == workspace_id
        )
    )
    unread = await session.scalar(
        select(func.count()).select_from(DjenPublication).where(
            DjenPublication.workspace_id == workspace_id,
            DjenPublication.is_read.is_(False),
        )
    )
    today_count = await session.scalar(
        select(func.count()).select_from(DjenPublication).where(
            DjenPublication.workspace_id == workspace_id,
            DjenPublication.publication_date == today,
        )
    )
    linked = await session.scalar(
        select(func.count()).select_from(DjenPublication).where(
            DjenPublication.workspace_id == workspace_id,
            DjenPublication.process_id.is_not(None),
        )
    )
    sync_times = [item.last_synced_at for item in subscriptions if item.last_synced_at]
    return DjenOverview(
        subscriptions=subscriptions,
        publications=publications,
        stats=DjenStats(
            total=total or 0,
            unread=unread or 0,
            today=today_count or 0,
            linked=linked or 0,
        ),
        last_synced_at=max(sync_times) if sync_times else None,
    )


@router.get("", response_model=DjenOverview)
async def read_djen(
    search: str = Query(default="", max_length=200),
    unread_only: bool = False,
    linked_only: bool = False,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DjenOverview:
    return await _overview(
        session,
        access.workspace_id,
        search=search,
        unread_only=unread_only,
        linked_only=linked_only,
    )


@router.post("/subscriptions", response_model=DjenSubscriptionRead, status_code=201)
async def create_subscription(
    payload: DjenSubscriptionCreate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DjenSubscription:
    subscription = DjenSubscription(workspace_id=access.workspace_id, **payload.model_dump())
    session.add(subscription)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta inscrição da OAB já está cadastrada.",
        ) from exc
    await session.refresh(subscription)
    return subscription


@router.delete("/subscriptions/{subscription_id}", status_code=204)
async def delete_subscription(
    subscription_id: UUID,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> Response:
    subscription = await session.scalar(
        select(DjenSubscription).where(
            DjenSubscription.id == subscription_id,
            DjenSubscription.workspace_id == access.workspace_id,
        )
    )
    if subscription is None:
        raise HTTPException(status_code=404, detail="Inscrição da OAB não encontrada.")
    await session.delete(subscription)
    await session.commit()
    return Response(status_code=204)


@router.post("/sync", response_model=DjenSyncResult)
async def sync_djen(
    days: int = Query(default=7, ge=1, le=30),
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DjenSyncResult:
    subscriptions = list(
        await session.scalars(
            select(DjenSubscription).where(
                DjenSubscription.workspace_id == access.workspace_id,
                DjenSubscription.active.is_(True),
            )
        )
    )
    if not subscriptions:
        raise HTTPException(status_code=422, detail="Cadastre ao menos uma inscrição da OAB.")

    processes = list(
        await session.scalars(select(Process).where(Process.workspace_id == access.workspace_id))
    )
    process_by_number = {
        normalized: process
        for process in processes
        if (normalized := normalize_process_number(process.number))
    }
    existing = list(
        await session.scalars(
            select(DjenPublication).where(DjenPublication.workspace_id == access.workspace_id)
        )
    )
    existing_by_external = {item.external_id: item for item in existing}
    now = datetime.now(UTC)
    today = datetime.now(OFFICE_TIMEZONE).date()
    fetched = 0
    created = 0
    linked = 0
    warnings: list[str] = []
    successful_subscriptions = 0

    for subscription in subscriptions:
        if subscription.last_synced_at:
            start = today - timedelta(days=days)
            start = max(start, subscription.last_synced_at.date() - timedelta(days=1))
        else:
            # A primeira consulta traz um histórico útil; depois disso a janela diária é curta.
            start = today - timedelta(days=30)
        try:
            items = await fetch_djen_publications(
                oab_number=subscription.oab_number,
                oab_state=subscription.oab_state,
                start=start,
                end=today,
            )
        except Exception as exc:
            warnings.append(f"OAB {subscription.oab_state} {subscription.oab_number}: {exc}")
            continue

        successful_subscriptions += 1
        fetched += len(items)
        subscription.last_synced_at = now
        oab_label = f"{subscription.oab_state} {subscription.oab_number}"
        for item in items:
            external_id = str(item.get("id") or item.get("hash") or "")
            if not external_id:
                continue
            raw_date = str(
                item.get("data_disponibilizacao") or item.get("datadisponibilizacao") or ""
            )
            try:
                publication_date = date.fromisoformat(raw_date[:10])
            except ValueError:
                publication_date = today
            process_number = normalize_process_number(str(item.get("numero_processo") or ""))
            matched_process = process_by_number.get(process_number)
            attorneys = []
            for relation in item.get("destinatarioadvogados") or []:
                lawyer = relation.get("advogado") or {}
                attorneys.append(
                    {
                        "name": str(lawyer.get("nome") or ""),
                        "oab_number": str(lawyer.get("numero_oab") or ""),
                        "oab_state": str(lawyer.get("uf_oab") or ""),
                    }
                )
            recipients = [
                str(recipient.get("nome") or "")
                for recipient in item.get("destinatarios") or []
                if recipient.get("nome")
            ]
            values = {
                "process_id": matched_process.id if matched_process else None,
                "publication_hash": str(item.get("hash") or ""),
                "publication_date": publication_date,
                "tribunal": str(item.get("siglaTribunal") or ""),
                "communication_type": str(item.get("tipoComunicacao") or "Publicação"),
                "court_body": str(item.get("nomeOrgao") or ""),
                "document_type": str(item.get("tipoDocumento") or ""),
                "medium": str(item.get("meiocompleto") or item.get("meio") or "DJEN"),
                "process_number": process_number,
                "process_number_formatted": str(
                    item.get("numeroprocessocommascara") or item.get("numero_processo") or ""
                ),
                "content": html_to_text(str(item.get("texto") or ""))[:250_000],
                "official_link": str(item.get("link") or ""),
                "recipients": recipients,
                "attorneys": attorneys,
            }
            publication = existing_by_external.get(external_id)
            if publication is None:
                publication = DjenPublication(
                    workspace_id=access.workspace_id,
                    external_id=external_id,
                    matched_oabs=[oab_label],
                    **values,
                )
                session.add(publication)
                existing_by_external[external_id] = publication
                created += 1
            else:
                for field, value in values.items():
                    setattr(publication, field, value)
                if oab_label not in publication.matched_oabs:
                    publication.matched_oabs = [*publication.matched_oabs, oab_label]
            if matched_process:
                linked += 1

    if successful_subscriptions == 0:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=warnings[0] if warnings else "Não foi possível consultar o DJEN.",
        )
    await session.commit()
    return DjenSyncResult(fetched=fetched, created=created, linked=linked, warnings=warnings)


@router.patch("/publications/{publication_id}/read", response_model=DjenPublicationRead)
async def update_read_status(
    publication_id: UUID,
    payload: DjenReadUpdate,
    access: WorkspaceAccess = Depends(get_workspace_access),
    session: AsyncSession = Depends(get_session),
) -> DjenPublication:
    publication = await session.scalar(
        select(DjenPublication)
        .options(selectinload(DjenPublication.process))
        .where(
            DjenPublication.id == publication_id,
            DjenPublication.workspace_id == access.workspace_id,
        )
    )
    if publication is None:
        raise HTTPException(status_code=404, detail="Publicação não encontrada.")
    publication.is_read = payload.is_read
    await session.commit()
    return await session.scalar(
        select(DjenPublication)
        .options(selectinload(DjenPublication.process))
        .where(DjenPublication.id == publication.id)
    )  # type: ignore[return-value]
