from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import (
    FinancialKind,
    InstallmentFrequency,
    InstallmentStatus,
    ProcessPriority,
    ProcessStatus,
)

BACKUP_FORMAT = "processflow-backup"
BACKUP_VERSION = 2


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _legacy_id(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value)
    return None


def _enum_value(value: Any, enum_type: type) -> Any:
    if not isinstance(value, str):
        return value
    folded = value.strip().casefold()
    for item in enum_type:
        if item.value.casefold() == folded or item.name.casefold() == folded:
            return item
    return value


class ImportAttachment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1, max_length=500)
    url: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_names(cls, value: Any) -> Any:
        if isinstance(value, dict):
            value = dict(value)
            value.setdefault("name", value.get("nome"))
        return value

    @field_validator("name", "url", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("url")
    @classmethod
    def require_web_url(cls, value: str) -> str:
        if urlsplit(value).scheme.casefold() not in {"http", "https"}:
            raise ValueError("o anexo precisa usar uma URL http ou https")
        return value


class ProcessImport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_id: str | None = Field(default=None, max_length=240)
    legacy_id: int | None = None
    client: str = Field(min_length=1, max_length=300)
    number: str = Field(default="", max_length=120)
    process_type: str = Field(default="", max_length=200)
    due_date: date | None = None
    next_action: str = Field(default="", max_length=300)
    priority: ProcessPriority = ProcessPriority.NORMAL
    status: ProcessStatus = ProcessStatus.IN_PROGRESS
    notes: str = Field(default="", max_length=200_000)
    origin: str = Field(default="legacy", max_length=50)
    trello_id: str | None = Field(default=None, max_length=100)
    trello_url: str | None = Field(default=None, max_length=4000)
    attachments: list[ImportAttachment] = Field(default_factory=list, max_length=500)

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_names(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        raw = dict(value)
        aliases = {
            "client": "cliente",
            "number": "numero",
            "process_type": "tipo",
            "due_date": "data_prazo",
            "next_action": "proxima_acao",
            "priority": "prioridade",
            "notes": "observacoes",
            "origin": "origem",
            "trello_url": "url_trello",
            "attachments": "anexos",
        }
        for target, source in aliases.items():
            if target not in raw and source in raw:
                raw[target] = raw[source]
        if "legacy_id" not in raw:
            raw["legacy_id"] = _legacy_id(raw.get("id"))
        # O status sempre vence o antigo booleano `concluido`, que podia ficar desatualizado.
        if "status" not in raw and raw.get("concluido") is True:
            raw["status"] = ProcessStatus.COMPLETED
        raw["due_date"] = _blank_to_none(raw.get("due_date"))
        raw["trello_id"] = _blank_to_none(raw.get("trello_id"))
        raw["trello_url"] = _blank_to_none(raw.get("trello_url"))
        return raw

    @field_validator(
        "client",
        "number",
        "process_type",
        "next_action",
        "notes",
        "origin",
        "trello_id",
        "trello_url",
        "source_id",
        mode="before",
    )
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: Any) -> Any:
        return _enum_value(value, ProcessPriority)

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: Any) -> Any:
        return _enum_value(value, ProcessStatus)

    @field_validator("trello_url")
    @classmethod
    def validate_trello_url(cls, value: str | None) -> str | None:
        if value is not None and urlsplit(value).scheme.casefold() not in {"http", "https"}:
            raise ValueError("a URL do Trello precisa usar http ou https")
        return value


class InstallmentImport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    number: int = Field(ge=1, le=10_000)
    total_installments: int = Field(ge=1, le=10_000)
    due_date: date
    received_date: date | None = None
    status: InstallmentStatus = InstallmentStatus.PENDING
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_names(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        raw = dict(value)
        aliases = {
            "number": "numero",
            "total_installments": "totalParcelas",
            "due_date": "dataVencimento",
            "received_date": "dataRecebimento",
            "amount": "valor",
        }
        for target, source in aliases.items():
            if target not in raw and source in raw:
                raw[target] = raw[source]
        raw["received_date"] = _blank_to_none(raw.get("received_date"))
        return raw

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: Any) -> Any:
        return _enum_value(value, InstallmentStatus)


class FinancialEntryImport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_id: str | None = Field(default=None, max_length=240)
    legacy_id: int | None = None
    kind: FinancialKind
    entry_date: date
    description: str = Field(min_length=1, max_length=500)
    category: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    notes: str = Field(default="", max_length=200_000)
    is_installment: bool = False
    frequency: InstallmentFrequency | None = None
    installments: list[InstallmentImport] = Field(default_factory=list, max_length=10_000)

    @model_validator(mode="before")
    @classmethod
    def accept_legacy_names(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        raw = dict(value)
        aliases = {
            "kind": "tipo",
            "entry_date": "data",
            "description": "descricao",
            "category": "categoria",
            "amount": "valor",
            "notes": "observacoes",
            "is_installment": "parcelado",
            "frequency": "periodicidade",
            "installments": "parcelas",
        }
        for target, source in aliases.items():
            if target not in raw and source in raw:
                raw[target] = raw[source]
        if "legacy_id" not in raw:
            raw["legacy_id"] = _legacy_id(raw.get("id"))
        raw["frequency"] = _blank_to_none(raw.get("frequency"))
        return raw

    @field_validator("kind", mode="before")
    @classmethod
    def normalize_kind(cls, value: Any) -> Any:
        return _enum_value(value, FinancialKind)

    @field_validator("frequency", mode="before")
    @classmethod
    def normalize_frequency(cls, value: Any) -> Any:
        value = _blank_to_none(value)
        return _enum_value(value, InstallmentFrequency)

    @field_validator("description", "category", "notes", "source_id", mode="before")
    @classmethod
    def strip_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_installment_details(self) -> FinancialEntryImport:
        if self.is_installment:
            if self.kind != FinancialKind.INCOME:
                raise ValueError("lançamento parcelado precisa ser uma receita")
            if self.frequency is None:
                raise ValueError("lançamento parcelado exige periodicidade")
            if not self.installments:
                raise ValueError("lançamento parcelado exige ao menos uma parcela")
        elif self.installments:
            raise ValueError("lançamento não parcelado não pode conter parcelas")
        return self


class ImportBundle(BaseModel):
    source_format: str
    processes: list[ProcessImport] = Field(default_factory=list, max_length=20_000)
    financial_entries: list[FinancialEntryImport] = Field(default_factory=list, max_length=20_000)


class ExportAttachment(BaseModel):
    name: str
    url: str


class ProcessExport(BaseModel):
    source_id: str
    legacy_id: int | None
    client: str
    number: str
    process_type: str
    due_date: date | None
    next_action: str
    priority: ProcessPriority
    status: ProcessStatus
    notes: str
    origin: str
    trello_id: str | None
    trello_url: str | None
    attachments: list[ExportAttachment]
    created_at: datetime
    updated_at: datetime


class InstallmentExport(BaseModel):
    number: int
    total_installments: int
    due_date: date
    received_date: date | None
    status: InstallmentStatus
    amount: Decimal


class FinancialEntryExport(BaseModel):
    source_id: str
    legacy_id: int | None
    kind: FinancialKind
    entry_date: date
    description: str
    category: str
    amount: Decimal
    notes: str
    is_installment: bool
    frequency: InstallmentFrequency | None
    installments: list[InstallmentExport]
    created_at: datetime
    updated_at: datetime


class ExportWorkspace(BaseModel):
    name: str


class DataExport(BaseModel):
    format: Literal["processflow-backup"] = BACKUP_FORMAT
    version: Literal[2] = BACKUP_VERSION
    exported_at: datetime
    workspace: ExportWorkspace
    processes: list[ProcessExport]
    financial_entries: list[FinancialEntryExport]


class ImportEntityReport(BaseModel):
    received: int
    imported: int
    skipped_duplicates: int
    deleted: int = 0


class DataImportReport(BaseModel):
    mode: Literal["preview", "merge", "replace"]
    committed: bool
    source_format: str
    processes: ImportEntityReport
    financial_entries: ImportEntityReport
    warnings: list[str] = Field(default_factory=list)


ImportMode = Literal["preview", "merge", "replace"]
ImportSourceType = Literal["processes", "finance"]
