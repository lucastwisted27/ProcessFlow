import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { AgendaPage } from "./AgendaPage";
import { DashboardPage } from "./DashboardPage";
import { DataPage } from "./DataPage";
import { apiRequest } from "./lib/api";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type {
  FinancialEntry,
  FinancialEntryList,
  FinancialKind,
  InstallmentFrequency,
  ProcessDraft,
  ProcessList,
  ProcessPriority,
  ProcessRecord,
  ProcessStatus,
  Workspace,
} from "./types";

const EMPTY_PROCESS: ProcessDraft = {
  client: "",
  number: "",
  process_type: "",
  due_date: "",
  next_action: "",
  priority: "Normal",
  status: "Em andamento",
  notes: "",
};

function formatDate(value: string | null): string {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function money(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function deadline(process: ProcessRecord): { className: string; text: string } {
  if (!process.due_date) return { className: "muted", text: "Sem prazo" };
  if (process.status === "Concluído") return { className: "green", text: "Concluído" };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(`${process.due_date}T00:00:00`);
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { className: "red", text: `${Math.abs(days)} dia(s) atrasado` };
  if (days === 0) return { className: "orange", text: "Vence hoje" };
  if (days === 1) return { className: "yellow", text: "Vence amanhã" };
  if (days <= 3) return { className: "yellow", text: `Faltam ${days} dias` };
  if (days <= 7) return { className: "blue", text: `Faltam ${days} dias` };
  return { className: "green", text: `Faltam ${days} dias` };
}

function ConfigurationNotice() {
  return (
    <main className="centered-page">
      <section className="auth-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">CONFIGURAÇÃO NECESSÁRIA</p>
        <h1>Conecte o ProcessFlow ao Supabase</h1>
        <p>
          Copie <code>frontend/.env.example</code> para <code>frontend/.env</code> e informe a URL e
          a chave pública do projeto. Nenhuma credencial real fica no código.
        </p>
      </section>
    </main>
  );
}

function AuthPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (mode === "register" && !result.data.session) {
      setMessage("Conta criada. Confirme o endereço de e-mail para entrar.");
    }
  }

  return (
    <main className="centered-page">
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div><strong>ProcessFlow</strong><span>Gestão online compartilhada</span></div>
        </div>
        <p className="eyebrow">ACESSO SEGURO</p>
        <h1>{mode === "login" ? "Entre na sua conta" : "Crie sua conta"}</h1>
        <p>Cada pessoa usa seu próprio acesso e compartilha apenas o espaço autorizado.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Senha<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {message && <div className="form-message" role="status">{message}</div>}
          <button className="primary-btn full-button" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button>
        </form>
        <button className="link-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMessage(""); }}>
          {mode === "login" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </section>
    </main>
  );
}

interface NewProcessModalProps {
  busy: boolean;
  onClose: () => void;
  onSave: (draft: ProcessDraft) => Promise<void>;
}

function NewProcessModal({ busy, onClose, onSave }: NewProcessModalProps) {
  const [draft, setDraft] = useState<ProcessDraft>(EMPTY_PROCESS);

  function field<K extends keyof ProcessDraft>(name: K, value: ProcessDraft[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(draft);
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-process-title">
        <header className="modal-head">
          <div><p className="eyebrow">PROCESSO</p><h2 id="new-process-title">Novo processo</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>Cliente / parte<input value={draft.client} onChange={(event) => field("client", event.target.value)} required autoFocus /></label>
            <label>Número<input value={draft.number} onChange={(event) => field("number", event.target.value)} /></label>
            <label>Tipo<input value={draft.process_type} onChange={(event) => field("process_type", event.target.value)} /></label>
            <label>Prazo<input type="date" value={draft.due_date} onChange={(event) => field("due_date", event.target.value)} /></label>
            <label>Próxima ação<input value={draft.next_action} onChange={(event) => field("next_action", event.target.value)} /></label>
            <label>Prioridade<select value={draft.priority} onChange={(event) => field("priority", event.target.value as ProcessPriority)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
            <label>Status<select value={draft.status} onChange={(event) => field("status", event.target.value as ProcessStatus)}><option>Em andamento</option><option>Atenção</option><option>Sobrestado</option><option>Concluído</option></select></label>
            <label className="full">Observações<textarea rows={4} value={draft.notes} onChange={(event) => field("notes", event.target.value)} /></label>
          </div>
          <footer className="modal-actions"><button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? "Salvando…" : "Salvar processo"}</button></footer>
        </form>
      </section>
    </div>
  );
}

interface ProcessDetailModalProps {
  process: ProcessRecord;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (draft: ProcessDraft) => Promise<void>;
  onToggleStatus: () => Promise<void>;
  onDelete: () => Promise<void>;
}

function processDraft(process: ProcessRecord): ProcessDraft {
  return {
    client: process.client,
    number: process.number,
    process_type: process.process_type,
    due_date: process.due_date ?? "",
    next_action: process.next_action,
    priority: process.priority,
    status: process.status,
    notes: process.notes,
  };
}

function ProcessDetailModal({
  process,
  busy,
  error,
  onClose,
  onSave,
  onToggleStatus,
  onDelete,
}: ProcessDetailModalProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draft, setDraft] = useState<ProcessDraft>(() => processDraft(process));

  useEffect(() => {
    setDraft(processDraft(process));
  }, [process]);

  function field<K extends keyof ProcessDraft>(name: K, value: ProcessDraft[K]) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // O erro já é exibido pelo componente pai; mantém o formulário aberto.
    }
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card process-detail-modal" role="dialog" aria-modal="true" aria-labelledby="process-detail-title">
        <header className="modal-head">
          <div>
            <p className="eyebrow">DETALHES DO PROCESSO</p>
            <h2 id="process-detail-title">{process.client}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        {error && <div className="detail-error error-banner" role="alert">{error}</div>}

        {editing ? (
          <form onSubmit={submit}>
            <div className="form-grid">
              <label>Cliente / parte<input value={draft.client} onChange={(event) => field("client", event.target.value)} required autoFocus /></label>
              <label>Número<input value={draft.number} onChange={(event) => field("number", event.target.value)} /></label>
              <label>Tipo<input value={draft.process_type} onChange={(event) => field("process_type", event.target.value)} /></label>
              <label>Prazo<input type="date" value={draft.due_date} onChange={(event) => field("due_date", event.target.value)} /></label>
              <label>Próxima ação<input value={draft.next_action} onChange={(event) => field("next_action", event.target.value)} /></label>
              <label>Prioridade<select value={draft.priority} onChange={(event) => field("priority", event.target.value as ProcessPriority)}><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label>
              <label>Status<select value={draft.status} onChange={(event) => field("status", event.target.value as ProcessStatus)}><option>Em andamento</option><option>Atenção</option><option>Sobrestado</option><option>Concluído</option></select></label>
              <label className="full">Observações<textarea rows={6} value={draft.notes} onChange={(event) => field("notes", event.target.value)} /></label>
            </div>
            <footer className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => { setDraft(processDraft(process)); setEditing(false); }}>Cancelar</button>
              <button className="primary-btn" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</button>
            </footer>
          </form>
        ) : (
          <>
            <div className="process-detail-body">
              <div className="process-detail-grid">
                <div><span>Número</span><strong>{process.number || "Não informado"}</strong></div>
                <div><span>Tipo</span><strong>{process.process_type || "Não informado"}</strong></div>
                <div><span>Prazo</span><strong>{formatDate(process.due_date)}</strong></div>
                <div><span>Próxima ação</span><strong>{process.next_action || "Não informada"}</strong></div>
                <div><span>Prioridade</span><strong>{process.priority}</strong></div>
                <div><span>Status</span><strong>{process.status}</strong></div>
                <div><span>Origem</span><strong>{process.origin || "Manual"}</strong></div>
                <div><span>Atualizado</span><strong>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(process.updated_at))}</strong></div>
              </div>

              <section className="process-detail-section">
                <span>Observações</span>
                <p>{process.notes || "Nenhuma observação cadastrada."}</p>
              </section>

              {(process.trello_url || process.attachments.length > 0) && (
                <section className="process-detail-section">
                  <span>Links e anexos</span>
                  <div className="process-links">
                    {process.trello_url && <a href={process.trello_url} target="_blank" rel="noreferrer">Abrir cartão no Trello ↗</a>}
                    {process.attachments.map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">{attachment.name} ↗</a>)}
                  </div>
                </section>
              )}

              {confirmingDelete && (
                <div className="delete-confirmation" role="alert">
                  <div><strong>Excluir este processo?</strong><span>Essa ação não pode ser desfeita.</span></div>
                  <div><button className="ghost-btn" onClick={() => setConfirmingDelete(false)}>Cancelar</button><button className="danger-btn" disabled={busy} onClick={() => void onDelete()}>{busy ? "Excluindo…" : "Excluir definitivamente"}</button></div>
                </div>
              )}
            </div>
            {!confirmingDelete && (
              <footer className="modal-actions process-detail-actions">
                <button className="danger-link" onClick={() => setConfirmingDelete(true)}>Excluir</button>
                <div>
                  <button className="ghost-btn" disabled={busy} onClick={() => void onToggleStatus()}>{process.status === "Concluído" ? "Reabrir" : "Marcar como concluído"}</button>
                  <button className="primary-btn" onClick={() => setEditing(true)}>Editar processo</button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}

interface FinancePageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
}

function FinancePage({ accessToken, workspaceId, workspaceName }: FinancePageProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    kind: "receita" as FinancialKind,
    entry_date: today,
    description: "",
    category: "Honorários",
    amount: "",
    notes: "",
    is_installment: false,
    frequency: "mensal" as InstallmentFrequency,
    installment_count: 2,
    first_due_date: today,
    first_received: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<FinancialEntryList>("/api/v1/financial-entries", {
        method: "GET",
        accessToken,
        workspaceId,
      });
      setEntries(data.items);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o financeiro.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    let pending = 0;
    let overdue = 0;
    for (const entry of entries) {
      if (entry.is_installment) {
        for (const installment of entry.installments) {
          if (installment.status === "recebida") income += Number(installment.amount);
          else {
            pending += Number(installment.amount);
            if (installment.due_date < today) overdue += 1;
          }
        }
      } else if (entry.kind === "receita") income += Number(entry.amount);
      else expense += Number(entry.amount);
    }
    return { income, expense, balance: income - expense, pending, overdue };
  }, [entries, today]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await apiRequest<FinancialEntry>("/api/v1/financial-entries", {
        method: "POST",
        accessToken,
        workspaceId,
        body: JSON.stringify({
          ...draft,
          amount: Number(draft.amount),
          kind: draft.is_installment ? "receita" : draft.kind,
          frequency: draft.is_installment ? draft.frequency : null,
          installment_count: draft.is_installment ? draft.installment_count : null,
          first_due_date: draft.is_installment ? draft.first_due_date : null,
          first_received: draft.is_installment && draft.first_received,
        }),
      });
      setShowForm(false);
      setDraft((current) => ({ ...current, description: "", amount: "", notes: "" }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o lançamento.");
    } finally {
      setSaving(false);
    }
  }

  async function receive(entryId: string, number: number) {
    try {
      await apiRequest<FinancialEntry>(
        `/api/v1/financial-entries/${entryId}/installments/${number}/receive`,
        { method: "POST", accessToken, workspaceId },
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível receber a parcela.");
    }
  }

  return <>
    <section className="page-head"><div><p className="eyebrow">FINANCEIRO COMPARTILHADO</p><h2>{workspaceName}</h2><p>Todos os membros autorizados veem os mesmos lançamentos e parcelas.</p></div><button className="primary-btn" onClick={() => setShowForm(true)}>＋ Nova movimentação</button></section>
    <section className="metrics-grid">
      <div className="metric blue"><span>RECEITAS</span><strong>{money(summary.income)}</strong><small>Valores efetivamente recebidos</small></div>
      <div className="metric red"><span>DESPESAS</span><strong>{money(summary.expense)}</strong><small>Saídas registradas</small></div>
      <div className={`metric ${summary.balance >= 0 ? "green" : "red"}`}><span>SALDO</span><strong>{money(summary.balance)}</strong><small>Receitas menos despesas</small></div>
      <div className="metric orange"><span>A RECEBER</span><strong>{money(summary.pending)}</strong><small>{summary.overdue} parcela(s) atrasada(s)</small></div>
    </section>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="panel finance-list-panel">
      <header className="panel-head"><div><p className="eyebrow">MOVIMENTAÇÕES</p><h3>Histórico financeiro</h3></div><button className="ghost-btn" onClick={() => void load()}>↻ Atualizar</button></header>
      {loading ? <div className="empty-state">Carregando financeiro…</div> : entries.length === 0 ? <div className="empty-state"><strong>Nenhuma movimentação cadastrada.</strong><span>Cadastre a primeira receita ou despesa.</span></div> : entries.map((entry) => <article className="finance-entry" key={entry.id}>
        <div><strong>{entry.description}</strong><span>{formatDate(entry.entry_date)} · {entry.category}</span></div>
        <span className={`kind ${entry.kind}`}>{entry.kind === "receita" ? "Receita" : "Despesa"}</span>
        <strong className="entry-value">{money(entry.amount)}</strong>
        {entry.is_installment && <div className="installment-strip">{entry.installments.map((installment) => <div key={installment.id} className={installment.status}><span>{installment.number}/{installment.total_installments} · {formatDate(installment.due_date)} · {money(installment.amount)}</span>{installment.status === "pendente" ? <button onClick={() => void receive(entry.id, installment.number)}>Receber</button> : <b>Recebida</b>}</div>)}</div>}
      </article>)}
    </section>
    {showForm && <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><section className="modal-card" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">FINANCEIRO</p><h2>Nova movimentação</h2></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Fechar">×</button></header><form onSubmit={save}><div className="form-grid">
      <label>Tipo<select value={draft.kind} disabled={draft.is_installment} onChange={(event) => setDraft({ ...draft, kind: event.target.value as FinancialKind })}><option value="receita">Receita</option><option value="despesa">Despesa</option></select></label>
      <label>Data<input type="date" required value={draft.entry_date} onChange={(event) => setDraft({ ...draft, entry_date: event.target.value })} /></label>
      <label className="full">Descrição<input required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <label>Categoria<input required value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
      <label>Valor<input type="number" min="0.01" step="0.01" required value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
      <label className="full check-line"><input type="checkbox" checked={draft.is_installment} onChange={(event) => setDraft({ ...draft, is_installment: event.target.checked, kind: event.target.checked ? "receita" : draft.kind })} /> Recebimento parcelado</label>
      {draft.is_installment && <><label>Parcelas<input type="number" min="2" max="120" value={draft.installment_count} onChange={(event) => setDraft({ ...draft, installment_count: Number(event.target.value) })} /></label><label>Periodicidade<select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as InstallmentFrequency })}><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select></label><label>Primeira parcela<input type="date" value={draft.first_due_date} onChange={(event) => setDraft({ ...draft, first_due_date: event.target.value })} /></label><label>Primeira já recebida?<select value={draft.first_received ? "sim" : "nao"} onChange={(event) => setDraft({ ...draft, first_received: event.target.value === "sim" })}><option value="sim">Sim</option><option value="nao">Não</option></select></label></>}
      <label className="full">Observações<textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    </div><footer className="modal-actions"><button type="button" className="ghost-btn" onClick={() => setShowForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving ? "Salvando…" : "Salvar movimentação"}</button></footer></form></section></div>}
  </>;
}

function WorkspaceApp({ session }: { session: Session }) {
  const [activePage, setActivePage] = useState<"dashboard" | "processes" | "agenda" | "finance" | "data">("dashboard");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(() => localStorage.getItem("processflow.workspace") ?? "");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceChooserOpen, setWorkspaceChooserOpen] = useState(true);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [processes, setProcesses] = useState<ProcessRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProcessStatus | "">("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState<ProcessRecord | null>(null);
  const [processActionError, setProcessActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const token = session.access_token;
  const workspace = useMemo(() => workspaces.find((item) => item.id === workspaceId), [workspaces, workspaceId]);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Workspace[]>("/api/v1/workspaces", { method: "GET", accessToken: token });
      setWorkspaces(data);
      const storedWorkspace = localStorage.getItem("processflow.workspace") ?? "";
      if (!data.some((item) => item.id === storedWorkspace)) {
        setWorkspaceId("");
        localStorage.removeItem("processflow.workspace");
      }
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os espaços.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadProcesses = useCallback(async () => {
    if (workspaceChooserOpen || !workspaceId) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (attentionOnly) params.set("attention", "true");
    try {
      const data = await apiRequest<ProcessList>(`/api/v1/processes?${params}`, {
        method: "GET",
        accessToken: token,
        workspaceId,
      });
      setProcesses(data.items);
      setTotal(data.total);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os processos.");
    } finally {
      setLoading(false);
    }
  }, [attentionOnly, query, statusFilter, token, workspaceChooserOpen, workspaceId]);

  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void loadProcesses(), 250);
    return () => window.clearTimeout(timeout);
  }, [loadProcesses]);

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await apiRequest<Workspace>("/api/v1/workspaces", {
        method: "POST",
        accessToken: token,
        body: JSON.stringify({ name: workspaceName }),
      });
      setWorkspaces((current) => [...current, created]);
      setWorkspaceId(created.id);
      localStorage.setItem("processflow.workspace", created.id);
      setWorkspaceChooserOpen(false);
      setCreatingWorkspace(false);
      setWorkspaceName("");
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o espaço.");
    } finally {
      setSaving(false);
    }
  }

  function enterWorkspace(selectedWorkspaceId: string) {
    setWorkspaceId(selectedWorkspaceId);
    localStorage.setItem("processflow.workspace", selectedWorkspaceId);
    setWorkspaceChooserOpen(false);
    setCreatingWorkspace(false);
    setError("");
  }

  async function createProcess(draft: ProcessDraft) {
    setSaving(true);
    try {
      await apiRequest<ProcessRecord>("/api/v1/processes", {
        method: "POST",
        accessToken: token,
        workspaceId,
        body: JSON.stringify({ ...draft, due_date: draft.due_date || null, attachments: [] }),
      });
      setShowNew(false);
      await loadProcesses();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o processo.");
    } finally {
      setSaving(false);
    }
  }

  async function updateSelectedProcess(draft: ProcessDraft) {
    if (!selectedProcess) return;
    setSaving(true);
    setProcessActionError("");
    try {
      const updated = await apiRequest<ProcessRecord>(`/api/v1/processes/${selectedProcess.id}`, {
        method: "PATCH",
        accessToken: token,
        workspaceId,
        body: JSON.stringify({ ...draft, due_date: draft.due_date || null }),
      });
      setSelectedProcess(updated);
      await loadProcesses();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível atualizar o processo.";
      setProcessActionError(message);
      throw reason instanceof Error ? reason : new Error(message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSelectedProcessStatus() {
    if (!selectedProcess) return;
    setSaving(true);
    setProcessActionError("");
    try {
      const updated = await apiRequest<ProcessRecord>(`/api/v1/processes/${selectedProcess.id}`, {
        method: "PATCH",
        accessToken: token,
        workspaceId,
        body: JSON.stringify({ status: selectedProcess.status === "Concluído" ? "Em andamento" : "Concluído" }),
      });
      setSelectedProcess(updated);
      await loadProcesses();
    } catch (reason) {
      setProcessActionError(reason instanceof Error ? reason.message : "Não foi possível alterar o status.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedProcess() {
    if (!selectedProcess) return;
    setSaving(true);
    setProcessActionError("");
    try {
      await apiRequest<void>(`/api/v1/processes/${selectedProcess.id}`, {
        method: "DELETE",
        accessToken: token,
        workspaceId,
      });
      setSelectedProcess(null);
      await loadProcesses();
    } catch (reason) {
      setProcessActionError(reason instanceof Error ? reason.message : "Não foi possível excluir o processo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && workspaces.length === 0) {
    return <main className="centered-page"><div className="loader">Carregando ambientes…</div></main>;
  }

  if (workspaceChooserOpen) {
    return (
      <main className="centered-page">
        <section className="auth-card workspace-chooser-card">
          <div className="brand-lockup"><div className="brand-mark">P</div><div><strong>ProcessFlow</strong><span>Gestão online</span></div></div>
          <p className="eyebrow">SELECIONE O AMBIENTE</p>
          <h1>Onde você quer entrar?</h1>
          <p>Escolha um ambiente disponível para sua conta ou crie um novo espaço separado.</p>

          <div className="workspace-choice-grid">
            {workspaces.map((item) => (
              <button className="workspace-choice" key={item.id} onClick={() => enterWorkspace(item.id)}>
                <span className="workspace-choice-icon">E</span>
                <span><strong>{item.name}</strong><small>{item.role === "admin" ? "Administrador" : "Acesso compartilhado"}</small></span>
                <b>Entrar →</b>
              </button>
            ))}
            <button className="workspace-choice workspace-choice-new" onClick={() => setCreatingWorkspace(true)}>
              <span className="workspace-choice-icon">＋</span>
              <span><strong>Novo ambiente</strong><small>Criar um espaço separado</small></span>
              <b>Criar →</b>
            </button>
          </div>

          {creatingWorkspace && (
            <form className="auth-form workspace-create-form" onSubmit={createWorkspace}>
              <label>Nome do novo ambiente<input value={workspaceName} minLength={2} autoFocus onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Ex.: Novo escritório" required /></label>
              {error && <div className="form-message">{error}</div>}
              <div className="workspace-create-actions"><button type="button" className="ghost-btn" onClick={() => { setCreatingWorkspace(false); setError(""); }}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving ? "Criando…" : "Criar ambiente"}</button></div>
            </form>
          )}

          {!creatingWorkspace && error && <div className="form-message workspace-message">{error}</div>}
          <button className="link-button" onClick={() => void supabase.auth.signOut()}>Entrar com outra conta</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">P</div><div><strong>ProcessFlow</strong><span>Gestão online</span></div></div>
        <nav aria-label="Navegação principal">
          <span className="side-label">NAVEGAÇÃO</span>
          <button className={`nav-item ${activePage === "dashboard" ? "active" : ""}`} onClick={() => setActivePage("dashboard")}>⌂ <span>Dashboard</span></button>
          <button className={`nav-item ${activePage === "processes" ? "active" : ""}`} onClick={() => setActivePage("processes")}>▣ <span>Processos</span></button>
          <button className={`nav-item ${activePage === "agenda" ? "active" : ""}`} onClick={() => setActivePage("agenda")}>▦ <span>Agenda</span></button>
          <button className={`nav-item ${activePage === "finance" ? "active" : ""}`} onClick={() => setActivePage("finance")}>R$ <span>Financeiro</span></button>
          <button className={`nav-item ${activePage === "data" ? "active" : ""}`} onClick={() => setActivePage("data")}>⇅ <span>Importar / Exportar</span></button>
        </nav>
        <div className="account-card"><span>{session.user.email}</span><button onClick={() => void supabase.auth.signOut()}>Sair</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><p className="eyebrow">GESTÃO</p><h1>{{ dashboard: "Dashboard", processes: "Processos", agenda: "Agenda", finance: "Financeiro", data: "Dados" }[activePage]}</h1></div>
          <div className="top-actions">
            <select aria-label="Espaço de trabalho" value={workspaceId} onChange={(event) => { setWorkspaceId(event.target.value); localStorage.setItem("processflow.workspace", event.target.value); }}>
              {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="ghost-btn" onClick={() => setWorkspaceChooserOpen(true)}>Trocar ambiente</button>
            {activePage === "processes" && <button className="primary-btn" onClick={() => setShowNew(true)}>＋ Novo processo</button>}
          </div>
        </header>

        {activePage === "processes" && <>
        <section className="page-head"><div><p className="eyebrow">ESPAÇO COMPARTILHADO</p><h2>{workspace?.name ?? "Carregando…"}</h2><p>{workspace?.role === "admin" ? "Administrador" : "Usuário"} · {total} processo(s) encontrado(s) · Clique em uma linha para abrir</p></div></section>

        <section className="toolbar" aria-label="Filtros">
          <label className="search-box">⌕<input placeholder="Buscar por cliente, número ou tipo…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProcessStatus | "")}><option value="">Todos os status</option><option>Em andamento</option><option>Atenção</option><option>Sobrestado</option><option>Concluído</option></select>
          <label className="check-filter"><input type="checkbox" checked={attentionOnly} onChange={(event) => setAttentionOnly(event.target.checked)} /> Prazos críticos</label>
          <button className="ghost-btn" onClick={() => void loadProcesses()}>↻ Atualizar</button>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className="panel process-panel">
          {loading ? <div className="empty-state">Carregando processos…</div> : processes.length === 0 ? <div className="empty-state"><strong>Nenhum processo encontrado.</strong><span>Cadastre o primeiro ou ajuste os filtros.</span></div> : (
            <div className="process-list">
              {processes.map((process) => {
                const due = deadline(process);
                return <article className="process-row process-row-clickable" key={process.id} role="button" tabIndex={0} aria-label={`Abrir processo de ${process.client}`} onClick={() => { setSelectedProcess(process); setProcessActionError(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedProcess(process); setProcessActionError(""); } }}>
                  <div className="process-main"><strong>{process.client}</strong><span>{process.number || "Sem número"} · {process.process_type || "Processo"}</span></div>
                  <div className={`deadline ${due.className}`}><span>{formatDate(process.due_date)}</span><strong>{due.text}</strong></div>
                  <span className={`priority priority-${process.priority.toLowerCase()}`}>{process.priority}</span>
                  <span className="status-pill">{process.status}</span>
                </article>;
              })}
            </div>
          )}
        </section>
        </>}
        {activePage === "dashboard" && workspace && <DashboardPage accessToken={token} workspaceId={workspace.id} workspaceName={workspace.name} onOpenProcess={(process) => { setSelectedProcess(process); setProcessActionError(""); }} />}
        {activePage === "agenda" && workspace && <AgendaPage accessToken={token} workspaceId={workspace.id} workspaceName={workspace.name} onOpenProcess={(process) => { setSelectedProcess(process); setProcessActionError(""); }} />}
        {activePage === "finance" && workspace && <FinancePage accessToken={token} workspaceId={workspace.id} workspaceName={workspace.name} />}
        {activePage === "data" && workspace && <DataPage accessToken={token} workspaceId={workspace.id} workspaceName={workspace.name} canImport={workspace.role === "admin"} />}
      </main>
      <nav className="mobile-nav" aria-label="Navegação móvel"><button className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>⌂<span>Dashboard</span></button><button className={activePage === "processes" ? "active" : ""} onClick={() => setActivePage("processes")}>▣<span>Processos</span></button><button className={activePage === "agenda" ? "active" : ""} onClick={() => setActivePage("agenda")}>▦<span>Agenda</span></button><button className={activePage === "finance" ? "active" : ""} onClick={() => setActivePage("finance")}>R$<span>Financeiro</span></button><button className={activePage === "data" ? "active" : ""} onClick={() => setActivePage("data")}>⇅<span>Dados</span></button><button onClick={() => void supabase.auth.signOut()}>↪<span>Sair</span></button></nav>
      {showNew && <NewProcessModal busy={saving} onClose={() => setShowNew(false)} onSave={createProcess} />}
      {selectedProcess && <ProcessDetailModal key={selectedProcess.id} process={selectedProcess} busy={saving} error={processActionError} onClose={() => setSelectedProcess(null)} onSave={updateSelectedProcess} onToggleStatus={toggleSelectedProcessStatus} onDelete={deleteSelectedProcess} />}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <ConfigurationNotice />;
  if (session === undefined) return <main className="centered-page"><div className="loader">Carregando…</div></main>;
  if (!session) return <AuthPanel />;
  return <WorkspaceApp session={session} />;
}
