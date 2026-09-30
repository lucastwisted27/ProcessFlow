from enum import StrEnum


class MemberRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class ProcessStatus(StrEnum):
    IN_PROGRESS = "Em andamento"
    ATTENTION = "Atenção"
    STAYED = "Sobrestado"
    COMPLETED = "Concluído"


class ProcessPriority(StrEnum):
    LOW = "Baixa"
    NORMAL = "Normal"
    HIGH = "Alta"
    URGENT = "Urgente"


class FinancialKind(StrEnum):
    INCOME = "receita"
    EXPENSE = "despesa"


class InstallmentFrequency(StrEnum):
    WEEKLY = "semanal"
    FORTNIGHTLY = "quinzenal"
    MONTHLY = "mensal"


class InstallmentStatus(StrEnum):
    PENDING = "pendente"
    RECEIVED = "recebida"
