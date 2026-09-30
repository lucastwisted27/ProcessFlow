from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import ProcessPriority, ProcessStatus
from app.models.finance import FinancialEntry, Installment
from app.models.process import Process, ProcessAttachment
from app.models.workspace import Workspace
from app.schemas.data_transfer import (
    BACKUP_FORMAT,
    BACKUP_VERSION,
    DataExport,
    DataImportReport,
    ExportAttachment,
    ExportWorkspace,
    FinancialEntryExport,
    FinancialEntryImport,
    ImportAttachment,
    ImportBundle,
    ImportEntityReport,
    ImportMode,
    ImportSourceType,
    InstallmentExport,
    ProcessExport,
    ProcessImport,
)


class ImportPayloadError(ValueError):
    def __init__(self, message: str, errors: list[dict[str, str]] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.errors = errors or []


def _validation_errors(exc: ValidationError) -> list[dict[str, str]]:
    return [
        {
            "location": ".".join(str(part) for part in error["loc"]),
            "message": error["msg"],
            "type": error["type"],
        }
        for error in exc.errors(include_url=False, include_input=False)
    ]


def _validate_bundle(
    *,
    source_format: str,
    processes: Any,
    financial_entries: Any,
) -> ImportBundle:
    try:
        return ImportBundle.model_validate(
            {
                "source_format": source_format,
                "processes": processes or [],
                "financial_entries": financial_entries or [],
            }
        )
    except ValidationError as exc:
        raise ImportPayloadError(
            "O arquivo contém dados inválidos.", _validation_errors(exc)
        ) from exc


def _infer_array_type(value: list[Any]) -> ImportSourceType | None:
    if not value:
        return None
    first = value[0]
    if not isinstance(first, dict):
        return None
    process_markers = {"cliente", "data_prazo", "proxima_acao", "process_type", "client"}
    finance_markers = {"valor", "data", "parcelas", "amount", "entry_date"}
    if process_markers.intersection(first):
        return "processes"
    if finance_markers.intersection(first):
        return "finance"
    return None


def _trello_processes(raw: dict[str, Any]) -> list[dict[str, Any]]:
    lists = raw.get("lists") if isinstance(raw.get("lists"), list) else []
    cards = raw.get("cards") if isinstance(raw.get("cards"), list) else []
    list_names = {
        str(item.get("id")): str(item.get("name") or "Lista")
        for item in lists
        if isinstance(item, dict) and item.get("id") is not None
    }
    result: list[dict[str, Any]] = []
    for card in cards:
        if not isinstance(card, dict):
            result.append(card)
            continue
        list_name = list_names.get(str(card.get("idList")), "Processo")
        list_folded = list_name.casefold()
        status = ProcessStatus.IN_PROGRESS
        if "finaliz" in list_folded or "conclu" in list_folded:
            status = ProcessStatus.COMPLETED
        elif "sobrest" in list_folded:
            status = ProcessStatus.STAYED

        labels = card.get("labels") if isinstance(card.get("labels"), list) else []
        label_text = " ".join(
            str(label.get("name") or label.get("color") or "")
            for label in labels
            if isinstance(label, dict)
        ).casefold()
        priority = ProcessPriority.NORMAL
        if any(term in label_text for term in ("urg", "vermelh", "red")):
            priority = ProcessPriority.URGENT
        elif any(term in label_text for term in ("alta", "orange", "laranja")):
            priority = ProcessPriority.HIGH
        elif any(term in label_text for term in ("baixa", "green", "verde")):
            priority = ProcessPriority.LOW

        attachments = card.get("attachments")
        if not isinstance(attachments, list):
            attachments = []
        result.append(
            {
                "client": card.get("name") or "Sem identificação",
                "number": str(card.get("idShort") or ""),
                "process_type": list_name,
                "due_date": str(card["due"])[:10] if card.get("due") else None,
                "next_action": (
                    "Verificar prazo"
                    if "prazo" in label_text or "deadline" in label_text
                    else "Acompanhar"
                ),
                "priority": priority,
                "status": status,
                "notes": str(card.get("desc") or ""),
                "origin": "Trello",
                "trello_id": str(card["id"]) if card.get("id") else None,
                "trello_url": card.get("url") or card.get("shortUrl"),
                "attachments": [
                    {
                        "name": attachment.get("name") or "Anexo",
                        "url": attachment.get("url"),
                    }
                    for attachment in attachments
                    if isinstance(attachment, dict) and attachment.get("url")
                ],
            }
        )
    return result


def parse_import_payload(
    raw: Any, *, source_type: ImportSourceType | None = None
) -> ImportBundle:
    """Aceita backup v2, backup Electron v1, arrays legados e exportação bruta do Trello."""

    if isinstance(raw, list):
        inferred_type = source_type or _infer_array_type(raw)
        if inferred_type is None:
            if not raw:
                return _validate_bundle(
                    source_format="legacy-empty-array",
                    processes=[],
                    financial_entries=[],
                )
            raise ImportPayloadError(
                "Não foi possível identificar o tipo do array. Informe source_type=processes "
                "ou source_type=finance."
            )
        return _validate_bundle(
            source_format=f"legacy-{inferred_type}-array",
            processes=raw if inferred_type == "processes" else [],
            financial_entries=raw if inferred_type == "finance" else [],
        )

    if not isinstance(raw, dict):
        raise ImportPayloadError("O JSON precisa ser um objeto ou um array.")

    if isinstance(raw.get("cards"), list):
        return _validate_bundle(
            source_format="trello-export",
            processes=_trello_processes(raw),
            financial_entries=[],
        )

    file_format = raw.get("format")
    if file_format == BACKUP_FORMAT:
        if raw.get("version") != BACKUP_VERSION:
            raise ImportPayloadError(
                f"Versão de backup incompatível. Esta API aceita a versão {BACKUP_VERSION}."
            )
        return _validate_bundle(
            source_format=f"{BACKUP_FORMAT}-v{BACKUP_VERSION}",
            processes=raw.get("processes", []),
            financial_entries=raw.get("financial_entries", []),
        )

    if raw.get("app") == "ProcessFlow" or "processos" in raw or "financeiro" in raw:
        return _validate_bundle(
            source_format="processflow-electron-v1",
            processes=raw.get("processos", []),
            financial_entries=raw.get("financeiro", []),
        )

    if "processes" in raw or "financial_entries" in raw:
        return _validate_bundle(
            source_format="processflow-unversioned",
            processes=raw.get("processes", []),
            financial_entries=raw.get("financial_entries", []),
        )

    raise ImportPayloadError(
        "Formato JSON não reconhecido. Use um backup do ProcessFlow ou uma exportação do Trello."
    )


def _fingerprint(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def process_import_key(item: ProcessImport) -> str:
    if item.source_id:
        if item.source_id.startswith(("processflow:", "trello:", "legacy:")):
            return item.source_id
        return f"processflow:source:{item.source_id}"
    if item.trello_id:
        return f"trello:{item.trello_id}"
    content = item.model_dump(mode="json", exclude={"source_id"})
    return f"legacy:process:{item.legacy_id or 'none'}:{_fingerprint(content)}"


def finance_import_key(item: FinancialEntryImport) -> str:
    if item.source_id:
        if item.source_id.startswith(("processflow:", "legacy:")):
            return item.source_id
        return f"processflow:source:{item.source_id}"
    content = item.model_dump(mode="json", exclude={"source_id"})
    return f"legacy:finance:{item.legacy_id or 'none'}:{_fingerprint(content)}"


def _existing_process_keys(row: Process) -> set[str]:
    keys = {f"processflow:process:{row.id}"}
    if row.import_key:
        keys.add(row.import_key)
    if row.trello_id:
        keys.add(f"trello:{row.trello_id}")
    legacy_shape = _process_to_import(row).model_copy(update={"source_id": None})
    keys.add(process_import_key(legacy_shape))
    return keys


def _existing_finance_keys(row: FinancialEntry) -> set[str]:
    keys = {f"processflow:finance:{row.id}"}
    if row.import_key:
        keys.add(row.import_key)
    legacy_shape = _finance_to_import(row).model_copy(update={"source_id": None})
    keys.add(finance_import_key(legacy_shape))
    return keys


def _process_to_import(row: Process) -> ProcessImport:
    return ProcessImport(
        source_id=row.import_key or f"processflow:process:{row.id}",
        legacy_id=row.legacy_id,
        client=row.client,
        number=row.number,
        process_type=row.process_type,
        due_date=row.due_date,
        next_action=row.next_action,
        priority=row.priority,
        status=row.status,
        notes=row.notes,
        origin=row.origin,
        trello_id=row.trello_id,
        trello_url=row.trello_url,
        attachments=[ImportAttachment(name=item.name, url=item.url) for item in row.attachments],
    )


def _finance_to_import(row: FinancialEntry) -> FinancialEntryImport:
    return FinancialEntryImport(
        source_id=row.import_key or f"processflow:finance:{row.id}",
        legacy_id=row.legacy_id,
        kind=row.kind,
        entry_date=row.entry_date,
        description=row.description,
        category=row.category,
        amount=row.amount,
        notes=row.notes,
        is_installment=row.is_installment,
        frequency=row.frequency,
        installments=[
            {
                "number": item.number,
                "total_installments": item.total_installments,
                "due_date": item.due_date,
                "received_date": item.received_date,
                "status": item.status,
                "amount": item.amount,
            }
            for item in row.installments
        ],
    )


def _process_model(item: ProcessImport, workspace_id: UUID, import_key: str) -> Process:
    process = Process(
        workspace_id=workspace_id,
        import_key=import_key,
        legacy_id=item.legacy_id,
        client=item.client,
        number=item.number,
        process_type=item.process_type,
        due_date=item.due_date,
        next_action=item.next_action,
        priority=item.priority,
        status=item.status,
        notes=item.notes,
        origin=item.origin,
        trello_id=item.trello_id,
        trello_url=item.trello_url,
    )
    process.attachments = [
        ProcessAttachment(name=attachment.name, url=attachment.url)
        for attachment in item.attachments
    ]
    return process


def _finance_model(
    item: FinancialEntryImport, workspace_id: UUID, import_key: str
) -> FinancialEntry:
    entry = FinancialEntry(
        workspace_id=workspace_id,
        import_key=import_key,
        legacy_id=item.legacy_id,
        kind=item.kind,
        entry_date=item.entry_date,
        description=item.description,
        category=item.category,
        amount=item.amount,
        notes=item.notes,
        is_installment=item.is_installment,
        frequency=item.frequency,
    )
    entry.installments = [
        Installment(
            number=installment.number,
            total_installments=installment.total_installments,
            due_date=installment.due_date,
            received_date=installment.received_date,
            status=installment.status,
            amount=installment.amount,
        )
        for installment in item.installments
    ]
    return entry


def import_warnings(bundle: ImportBundle) -> list[str]:
    warnings: list[str] = []
    if not bundle.processes and not bundle.financial_entries:
        warnings.append("O arquivo não contém registros para importar.")
    for index, entry in enumerate(bundle.financial_entries, start=1):
        if not entry.is_installment:
            continue
        count = len(entry.installments)
        declared = {item.total_installments for item in entry.installments}
        if declared != {count}:
            warnings.append(
                f"Financeiro #{index}: totalParcelas não corresponde "
                f"às {count} parcelas do arquivo."
            )
        installment_total = sum((item.amount for item in entry.installments), Decimal("0.00"))
        if installment_total != entry.amount:
            warnings.append(
                f"Financeiro #{index}: soma das parcelas difere do valor total do lançamento."
            )
    return warnings


async def _workspace_rows(
    session: AsyncSession, workspace_id: UUID
) -> tuple[list[Process], list[FinancialEntry]]:
    processes = list(
        await session.scalars(
            select(Process)
            .options(selectinload(Process.attachments))
            .where(Process.workspace_id == workspace_id)
            .order_by(Process.created_at, Process.id)
        )
    )
    finances = list(
        await session.scalars(
            select(FinancialEntry)
            .options(selectinload(FinancialEntry.installments))
            .where(FinancialEntry.workspace_id == workspace_id)
            .order_by(FinancialEntry.created_at, FinancialEntry.id)
        )
    )
    return processes, finances


async def export_workspace_data(session: AsyncSession, workspace_id: UUID) -> DataExport:
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise LookupError("Workspace não encontrado.")
    processes, finances = await _workspace_rows(session, workspace_id)
    return DataExport(
        exported_at=datetime.now(UTC),
        workspace=ExportWorkspace(name=workspace.name),
        processes=[
            ProcessExport(
                source_id=row.import_key or f"processflow:process:{row.id}",
                legacy_id=row.legacy_id,
                client=row.client,
                number=row.number,
                process_type=row.process_type,
                due_date=row.due_date,
                next_action=row.next_action,
                priority=row.priority,
                status=row.status,
                notes=row.notes,
                origin=row.origin,
                trello_id=row.trello_id,
                trello_url=row.trello_url,
                attachments=[
                    ExportAttachment(name=item.name, url=item.url) for item in row.attachments
                ],
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in processes
        ],
        financial_entries=[
            FinancialEntryExport(
                source_id=row.import_key or f"processflow:finance:{row.id}",
                legacy_id=row.legacy_id,
                kind=row.kind,
                entry_date=row.entry_date,
                description=row.description,
                category=row.category,
                amount=row.amount,
                notes=row.notes,
                is_installment=row.is_installment,
                frequency=row.frequency,
                installments=[
                    InstallmentExport(
                        number=item.number,
                        total_installments=item.total_installments,
                        due_date=item.due_date,
                        received_date=item.received_date,
                        status=item.status,
                        amount=item.amount,
                    )
                    for item in row.installments
                ],
                created_at=row.created_at,
                updated_at=row.updated_at,
            )
            for row in finances
        ],
    )


async def import_workspace_data(
    session: AsyncSession,
    workspace_id: UUID,
    bundle: ImportBundle,
    *,
    mode: ImportMode,
) -> DataImportReport:
    existing_processes, existing_finances = await _workspace_rows(session, workspace_id)
    replace = mode == "replace"

    process_keys: set[str] = set()
    finance_keys: set[str] = set()
    if not replace:
        for row in existing_processes:
            process_keys.update(_existing_process_keys(row))
        for row in existing_finances:
            finance_keys.update(_existing_finance_keys(row))

    processes_to_add: list[tuple[ProcessImport, str]] = []
    skipped_processes = 0
    for item in bundle.processes:
        key = process_import_key(item)
        if key in process_keys:
            skipped_processes += 1
            continue
        process_keys.add(key)
        processes_to_add.append((item, key))

    finances_to_add: list[tuple[FinancialEntryImport, str]] = []
    skipped_finances = 0
    for item in bundle.financial_entries:
        key = finance_import_key(item)
        if key in finance_keys:
            skipped_finances += 1
            continue
        finance_keys.add(key)
        finances_to_add.append((item, key))

    committed = mode != "preview"
    if committed:
        try:
            if replace:
                await session.execute(
                    delete(Process)
                    .where(Process.workspace_id == workspace_id)
                    .execution_options(synchronize_session=False)
                )
                await session.execute(
                    delete(FinancialEntry)
                    .where(FinancialEntry.workspace_id == workspace_id)
                    .execution_options(synchronize_session=False)
                )
            session.add_all(
                [
                    _process_model(item, workspace_id, import_key)
                    for item, import_key in processes_to_add
                ]
            )
            session.add_all(
                [
                    _finance_model(item, workspace_id, import_key)
                    for item, import_key in finances_to_add
                ]
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return DataImportReport(
        mode=mode,
        committed=committed,
        source_format=bundle.source_format,
        processes=ImportEntityReport(
            received=len(bundle.processes),
            imported=len(processes_to_add),
            skipped_duplicates=skipped_processes,
            deleted=len(existing_processes) if replace else 0,
        ),
        financial_entries=ImportEntityReport(
            received=len(bundle.financial_entries),
            imported=len(finances_to_add),
            skipped_duplicates=skipped_finances,
            deleted=len(existing_finances) if replace else 0,
        ),
        warnings=import_warnings(bundle),
    )
