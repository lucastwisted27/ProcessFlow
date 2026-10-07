export type WorkspaceRole = "admin" | "member";

export interface Workspace {
  id: string;
  name: string;
  role: WorkspaceRole;
  created_at: string;
}

export type ProcessStatus = "Em andamento" | "Atenção" | "Sobrestado" | "Concluído";
export type ProcessPriority = "Baixa" | "Normal" | "Alta" | "Urgente";

export interface ProcessRecord {
  id: string;
  legacy_id: number | null;
  client: string;
  number: string;
  process_type: string;
  due_date: string | null;
  next_action: string;
  priority: ProcessPriority;
  status: ProcessStatus;
  notes: string;
  origin: string;
  trello_id: string | null;
  trello_url: string | null;
  attachments: Array<{ id: string; name: string; url: string }>;
  created_at: string;
  updated_at: string;
}

export interface ProcessList {
  items: ProcessRecord[];
  total: number;
  offset: number;
  limit: number;
}

export interface ProcessDraft {
  client: string;
  number: string;
  process_type: string;
  due_date: string;
  next_action: string;
  priority: ProcessPriority;
  status: ProcessStatus;
  notes: string;
}

export type AgendaEventType = "Audiência" | "Reunião" | "Compromisso" | "Lembrete";
export type AgendaEventStatus = "agendado" | "concluído" | "cancelado";

export interface AgendaEvent {
  id: string;
  title: string;
  event_type: AgendaEventType;
  starts_at: string;
  ends_at: string | null;
  process_id: string | null;
  process: { id: string; client: string; number: string } | null;
  location: string;
  notes: string;
  status: AgendaEventStatus;
  created_at: string;
  updated_at: string;
}

export interface ProcessDeadline {
  id: string;
  client: string;
  number: string;
  due_date: string;
  next_action: string;
  priority: ProcessPriority;
}

export interface AgendaOverview {
  events: AgendaEvent[];
  process_deadlines: ProcessDeadline[];
  overdue_deadlines: ProcessDeadline[];
}

export type FinancialKind = "receita" | "despesa";
export type InstallmentFrequency = "semanal" | "quinzenal" | "mensal";

export interface Installment {
  id: string;
  number: number;
  total_installments: number;
  due_date: string;
  received_date: string | null;
  status: "pendente" | "recebida";
  amount: string;
}

export interface FinancialEntry {
  id: string;
  legacy_id: number | null;
  kind: FinancialKind;
  entry_date: string;
  description: string;
  category: string;
  amount: string;
  notes: string;
  is_installment: boolean;
  frequency: InstallmentFrequency | null;
  installments: Installment[];
  created_at: string;
  updated_at: string;
}

export interface FinancialEntryList {
  items: FinancialEntry[];
  total: number;
}

export interface DashboardSummary {
  processes: {
    total: number;
    in_progress: number;
    critical_deadlines: number;
    completed: number;
  };
  finances: {
    receivable: number | string;
    received: number | string;
    overdue: number | string;
    balance: number | string;
  };
}

export interface DjenSubscription {
  id: string;
  lawyer_name: string;
  oab_number: string;
  oab_state: string;
  active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface DjenPublicationSummary {
  id: string;
  external_id: string;
  publication_date: string;
  tribunal: string;
  communication_type: string;
  court_body: string;
  document_type: string;
  medium: string;
  process_number: string;
  process_number_formatted: string;
  content_preview: string;
  matched_oabs: string[];
  is_read: boolean;
  process: { id: string; client: string; number: string } | null;
  created_at: string;
}

export interface DjenPublication extends DjenPublicationSummary {
  content: string;
  official_link: string;
  recipients: string[];
  attorneys: Array<{ name: string; oab_number: string; oab_state: string }>;
}

export interface DjenOverview {
  subscriptions: DjenSubscription[];
  publications: DjenPublicationSummary[];
  stats: { total: number; unread: number; today: number; linked: number };
  last_synced_at: string | null;
}

export interface DjenSyncResult {
  fetched: number;
  created: number;
  linked: number;
  warnings: string[];
}

export type PriorityItemType = "balcao" | "inicial";

export interface PriorityItem {
  id: string;
  item_type: PriorityItemType;
  process_number: string;
  name: string;
  counterparty: string;
  request_text: string;
  response_text: string;
  missing_document: boolean | null;
  notes: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImportEntitySummary {
  received: number;
  imported: number;
  skipped_duplicates: number;
  deleted: number;
}

export interface DataImportSummary {
  mode: "preview" | "merge" | "replace";
  committed: boolean;
  source_format: string;
  processes: ImportEntitySummary;
  financial_entries: ImportEntitySummary;
  agenda_events: ImportEntitySummary;
  warnings: string[];
}
