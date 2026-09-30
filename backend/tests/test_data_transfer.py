from decimal import Decimal

import pytest

from app.models.enums import ProcessStatus
from app.services.data_transfer import (
    ImportPayloadError,
    finance_import_key,
    import_warnings,
    parse_import_payload,
    process_import_key,
)


def test_accepts_electron_v1_and_keeps_status_authoritative() -> None:
    bundle = parse_import_payload(
        {
            "app": "ProcessFlow",
            "version": "1.0",
            "processos": [
                {
                    "id": 7,
                    "cliente": "Carlos",
                    "numero": "123",
                    "tipo": "Petição",
                    "data_prazo": "2026-10-01",
                    "proxima_acao": "Protocolar",
                    "prioridade": "Alta",
                    "status": "Em andamento",
                    "concluido": True,
                    "observacoes": "Teste",
                    "origem": "manual",
                    "trello_id": "card-1",
                    "url_trello": "https://trello.com/c/card-1",
                    "anexos": [{"nome": "Petição", "url": "https://example.com/a.pdf"}],
                }
            ],
            "financeiro": [
                {
                    "id": "9",
                    "tipo": "receita",
                    "data": "2026-09-29",
                    "descricao": "Honorários",
                    "categoria": "Serviços",
                    "valor": 100,
                    "observacoes": "",
                    "parcelado": False,
                    "parcelas": [],
                }
            ],
        }
    )

    assert bundle.source_format == "processflow-electron-v1"
    assert bundle.processes[0].status == ProcessStatus.IN_PROGRESS
    assert bundle.processes[0].legacy_id == 7
    assert bundle.processes[0].attachments[0].name == "Petição"
    assert bundle.financial_entries[0].legacy_id == 9
    assert bundle.financial_entries[0].amount == Decimal("100")


def test_accepts_and_infers_bare_legacy_process_array() -> None:
    bundle = parse_import_payload(
        [
            {
                "id": 1,
                "cliente": "Cliente",
                "numero": "",
                "tipo": "Processo",
                "data_prazo": "",
                "proxima_acao": "",
                "prioridade": "Normal",
                "status": "Em andamento",
                "observacoes": "",
            }
        ]
    )
    assert len(bundle.processes) == 1
    assert bundle.financial_entries == []


def test_empty_array_is_safe_noop() -> None:
    bundle = parse_import_payload([])
    assert bundle.processes == []
    assert bundle.financial_entries == []
    assert import_warnings(bundle) == ["O arquivo não contém registros para importar."]


def test_trello_export_preserves_card_identity_and_url() -> None:
    bundle = parse_import_payload(
        {
            "lists": [{"id": "list-1", "name": "Finalizados"}],
            "cards": [
                {
                    "id": "card-1",
                    "idList": "list-1",
                    "idShort": 42,
                    "name": "Cliente Trello",
                    "url": "https://trello.com/c/card-1",
                    "desc": "Descrição",
                    "labels": [{"name": "Urgente"}],
                    "attachments": [],
                }
            ],
        }
    )
    process = bundle.processes[0]
    assert process.trello_id == "card-1"
    assert process.trello_url == "https://trello.com/c/card-1"
    assert process.status == ProcessStatus.COMPLETED
    assert process_import_key(process) == "trello:card-1"


def test_rejects_invalid_financial_data_atomically_before_database_work() -> None:
    with pytest.raises(ImportPayloadError) as error:
        parse_import_payload(
            {
                "app": "ProcessFlow",
                "version": "1.0",
                "processos": [],
                "financeiro": [
                    {
                        "tipo": "receita",
                        "data": "data-inválida",
                        "descricao": "Honorários",
                        "categoria": "Serviços",
                        "valor": 0,
                        "parcelado": False,
                    }
                ],
            }
        )
    assert error.value.errors


def test_duplicate_legacy_ids_do_not_collapse_different_processes() -> None:
    first, second = parse_import_payload(
        {
            "processos": [
                {"id": 1, "cliente": "A", "status": "Em andamento"},
                {"id": 1, "cliente": "B", "status": "Em andamento"},
            ],
            "financeiro": [],
        }
    ).processes
    assert process_import_key(first) != process_import_key(second)


def test_canonical_source_ids_make_roundtrip_idempotent() -> None:
    bundle = parse_import_payload(
        {
            "format": "processflow-backup",
            "version": 2,
            "processes": [
                {
                    "source_id": "processflow:process:11111111-1111-1111-1111-111111111111",
                    "client": "Cliente",
                }
            ],
            "financial_entries": [
                {
                    "source_id": "processflow:finance:22222222-2222-2222-2222-222222222222",
                    "kind": "receita",
                    "entry_date": "2026-09-29",
                    "description": "Honorários",
                    "category": "Serviços",
                    "amount": "50.00",
                }
            ],
        }
    )
    assert process_import_key(bundle.processes[0]).startswith("processflow:process:")
    assert finance_import_key(bundle.financial_entries[0]).startswith("processflow:finance:")


def test_installment_inconsistencies_are_warnings_not_data_loss() -> None:
    bundle = parse_import_payload(
        {
            "processos": [],
            "financeiro": [
                {
                    "tipo": "receita",
                    "data": "2026-09-29",
                    "descricao": "Honorários",
                    "categoria": "Serviços",
                    "valor": "100.00",
                    "parcelado": True,
                    "periodicidade": "mensal",
                    "parcelas": [
                        {
                            "numero": 1,
                            "totalParcelas": 3,
                            "dataVencimento": "2026-09-29",
                            "dataRecebimento": "",
                            "status": "pendente",
                            "valor": "40.00",
                        },
                        {
                            "numero": 2,
                            "totalParcelas": 3,
                            "dataVencimento": "2026-10-29",
                            "status": "pendente",
                            "valor": "40.00",
                        },
                    ],
                }
            ],
        }
    )
    warnings = import_warnings(bundle)
    assert len(warnings) == 2
