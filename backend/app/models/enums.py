from enum import StrEnum


class MemberRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class ProcessStatus(StrEnum):
    IN_PROGRESS = "Em andamento"
    ATTENTION = "Atenção"
    STAYED = "Sobrestado"
    AWAITING_PAYMENT = "Aguardando Pagamento"
    AWAITING_OPPOSING_MANIFESTATION = "Aguardando Manifestação Contrária"
    DECISION_ACKNOWLEDGMENT = "Ciência de Decisão"
    SMALL_CLAIMS_COURT = "Juizado"
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


class AgendaEventType(StrEnum):
    HEARING = "Audiência"
    MEETING = "Reunião"
    COMMITMENT = "Compromisso"
    REMINDER = "Lembrete"


class AgendaEventStatus(StrEnum):
    SCHEDULED = "agendado"
    COMPLETED = "concluído"
    CANCELED = "cancelado"
