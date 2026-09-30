"""Audita e importa os JSONs legados sem alterá-los.

O modo padrão é somente leitura. Use --commit apenas depois de revisar o relatório.
"""

import argparse
import asyncio
import json
from collections import Counter
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.db import get_session_factory
from app.models.enums import (
    FinancialKind,
    InstallmentFrequency,
    InstallmentStatus,
    ProcessPriority,
    ProcessStatus,
)
from app.models.finance import FinancialEntry, Installment
from app.models.process import Process, ProcessAttachment
from app.models.workspace import Workspace

ROOT = Path(__file__).resolve().parents[2]


def read_array(path: Path) -> list[dict]:
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, list):
        raise ValueError(f"{path} precisa conter um array JSON")
    return value


def parse_date(value: object) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def audit(processes: list[dict], finance: list[dict]) -> dict:
    ids = [str(item.get("id", "")) for item in processes]
    trello_ids = [str(item.get("trello_id")) for item in processes if item.get("trello_id")]
    id_counts = Counter(ids)
    conflicts = sum(
        bool(item.get("concluido")) != (item.get("status") == ProcessStatus.COMPLETED.value)
        for item in processes
    )
    return {
        "mode": "dry-run",
        "processes": len(processes),
        "unique_legacy_ids": len(set(ids)),
        "duplicate_legacy_id_groups": sum(count > 1 for count in id_counts.values()),
        "unique_trello_ids": len(set(trello_ids)),
        "status_concluido_conflicts": conflicts,
        "attachments": sum(len(item.get("anexos") or []) for item in processes),
        "financial_entries": len(finance),
        "financial_installments": sum(len(item.get("parcelas") or []) for item in finance),
    }


def process_from_legacy(item: dict, workspace_id: UUID) -> Process:
    try:
        process_status = ProcessStatus(item.get("status") or ProcessStatus.IN_PROGRESS.value)
    except ValueError:
        process_status = ProcessStatus.IN_PROGRESS
    try:
        priority = ProcessPriority(item.get("prioridade") or ProcessPriority.NORMAL.value)
    except ValueError:
        priority = ProcessPriority.NORMAL

    process = Process(
        workspace_id=workspace_id,
        legacy_id=int(item["id"]) if item.get("id") is not None else None,
        client=str(item.get("cliente") or "Sem identificação"),
        number=str(item.get("numero") or ""),
        process_type=str(item.get("tipo") or ""),
        due_date=parse_date(item.get("data_prazo")),
        next_action=str(item.get("proxima_acao") or ""),
        priority=priority,
        status=process_status,
        notes=str(item.get("observacoes") or ""),
        origin=str(item.get("origem") or "legacy"),
        trello_id=str(item["trello_id"]) if item.get("trello_id") else None,
        trello_url=str(item["url_trello"]) if item.get("url_trello") else None,
    )
    process.attachments = [
        ProcessAttachment(name=str(attachment.get("nome") or "Anexo"), url=str(attachment["url"]))
        for attachment in item.get("anexos") or []
        if attachment.get("url")
    ]
    return process


def finance_from_legacy(item: dict, workspace_id: UUID) -> FinancialEntry:
    is_installment = bool(item.get("parcelado"))
    frequency = None
    if is_installment and item.get("periodicidade"):
        frequency = InstallmentFrequency(item["periodicidade"])
    entry = FinancialEntry(
        workspace_id=workspace_id,
        legacy_id=int(item["id"]) if item.get("id") is not None else None,
        kind=FinancialKind(item.get("tipo") or FinancialKind.INCOME.value),
        entry_date=parse_date(item.get("data")) or date.today(),
        description=str(item.get("descricao") or "Sem descrição"),
        category=str(item.get("categoria") or "Outros"),
        amount=Decimal(str(item.get("valor") or "0")),
        notes=str(item.get("observacoes") or ""),
        is_installment=is_installment,
        frequency=frequency,
    )
    entry.installments = [
        Installment(
            number=int(installment["numero"]),
            total_installments=int(installment["totalParcelas"]),
            due_date=parse_date(installment.get("dataVencimento")) or entry.entry_date,
            received_date=parse_date(installment.get("dataRecebimento")),
            status=InstallmentStatus(installment.get("status") or InstallmentStatus.PENDING.value),
            amount=Decimal(str(installment.get("valor") or "0")),
        )
        for installment in item.get("parcelas") or []
    ]
    return entry


async def commit_import(
    workspace_id: UUID, processes: list[dict], finance: list[dict]
) -> dict[str, int | str]:
    factory = get_session_factory()
    async with factory() as session:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise ValueError("Workspace não encontrado. Crie-o pela aplicação antes de importar.")

        existing_trello = set(
            await session.scalars(
                select(Process.trello_id).where(
                    Process.workspace_id == workspace_id,
                    Process.trello_id.is_not(None),
                )
            )
        )
        existing_finance_ids = set(
            await session.scalars(
                select(FinancialEntry.legacy_id).where(
                    FinancialEntry.workspace_id == workspace_id,
                    FinancialEntry.legacy_id.is_not(None),
                )
            )
        )

        imported_processes = 0
        skipped_processes = 0
        for item in processes:
            trello_id = str(item["trello_id"]) if item.get("trello_id") else None
            if trello_id and trello_id in existing_trello:
                skipped_processes += 1
                continue
            session.add(process_from_legacy(item, workspace_id))
            if trello_id:
                existing_trello.add(trello_id)
            imported_processes += 1

        imported_finance = 0
        skipped_finance = 0
        for item in finance:
            legacy_id = int(item["id"]) if item.get("id") is not None else None
            if legacy_id is not None and legacy_id in existing_finance_ids:
                skipped_finance += 1
                continue
            session.add(finance_from_legacy(item, workspace_id))
            if legacy_id is not None:
                existing_finance_ids.add(legacy_id)
            imported_finance += 1

        await session.commit()
        return {
            "mode": "commit",
            "imported_processes": imported_processes,
            "skipped_processes": skipped_processes,
            "imported_financial_entries": imported_finance,
            "skipped_financial_entries": skipped_finance,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processes", type=Path, default=ROOT / "processos.json")
    parser.add_argument("--finance", type=Path, default=ROOT / "financeiro.json")
    parser.add_argument("--workspace-id", type=UUID)
    parser.add_argument("--commit", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    processes = read_array(args.processes)
    finance = read_array(args.finance)
    report = audit(processes, finance)
    if args.commit:
        if args.workspace_id is None:
            raise SystemExit("--workspace-id é obrigatório com --commit")
        report = asyncio.run(commit_import(args.workspace_id, processes, finance))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
