import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "./lib/api";
import type { DashboardSummary, FinancialEntryList, ProcessList } from "./types";

interface DashboardPageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
}

type DetailKey =
  | "process-total"
  | "process-progress"
  | "process-critical"
  | "process-completed"
  | "finance-receivable"
  | "finance-received"
  | "finance-overdue"
  | "finance-balance";

interface DetailRow {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  amount?: number;
}

const DETAIL_TITLES: Record<DetailKey, { eyebrow: string; title: string; empty: string }> = {
  "process-total": { eyebrow: "PROCESSOS", title: "Todos os processos", empty: "Nenhum processo cadastrado." },
  "process-progress": { eyebrow: "PROCESSOS", title: "Processos em andamento", empty: "Nenhum processo em andamento." },
  "process-critical": { eyebrow: "PRAZOS", title: "Prazos críticos", empty: "Nenhum prazo crítico." },
  "process-completed": { eyebrow: "PROCESSOS", title: "Processos concluídos", empty: "Nenhum processo concluído." },
  "finance-receivable": { eyebrow: "FINANCEIRO", title: "Valores a receber", empty: "Nenhum valor pendente." },
  "finance-received": { eyebrow: "FINANCEIRO", title: "Valores recebidos", empty: "Nenhum recebimento registrado." },
  "finance-overdue": { eyebrow: "FINANCEIRO", title: "Recebimentos em atraso", empty: "Nenhum recebimento atrasado." },
  "finance-balance": { eyebrow: "FINANCEIRO", title: "Composição do saldo", empty: "Nenhuma movimentação no saldo." },
};

function money(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
}

function formatDate(value: string | null): string {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function localDateKey(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function MetricCard({ tone, icon, label, value, detail, onClick }: {
  tone: "blue" | "green" | "orange" | "red";
  icon: string;
  label: string;
  value: string | number;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className={`dashboard-metric dashboard-metric-clickable ${tone}`} onClick={onClick} aria-label={`${label}: ${value}. Abrir detalhes.`}>
      <div className="dashboard-metric-head"><span>{label}</span><b aria-hidden="true">{icon}</b></div>
      <strong>{value}</strong>
      <small>{detail}</small>
      <em>Ver detalhes →</em>
    </button>
  );
}

function DetailModal({ detailKey, rows, total, loading, error, onClose }: {
  detailKey: DetailKey;
  rows: DetailRow[];
  total: number;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  const copy = DETAIL_TITLES[detailKey];
  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card dashboard-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-detail-title">
        <header className="modal-head">
          <div><p className="eyebrow">{copy.eyebrow}</p><h2 id="dashboard-detail-title">{copy.title}</h2><span>{total} registro(s)</span></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {error && <div className="detail-error error-banner" role="alert">{error}</div>}
        <div className="dashboard-detail-list">
          {loading ? <div className="dashboard-detail-empty">Carregando detalhes…</div> : rows.length === 0 ? <div className="dashboard-detail-empty">{copy.empty}</div> : rows.map((row) => (
            <article key={row.id} className="dashboard-detail-row">
              <div><strong>{row.title}</strong><span>{row.subtitle}</span></div>
              <b>{row.badge}</b>
              {row.amount !== undefined && <strong className={row.amount < 0 ? "negative" : "positive"}>{money(row.amount)}</strong>}
            </article>
          ))}
        </div>
        <footer className="modal-actions"><button className="ghost-btn" onClick={onClose}>Fechar</button></footer>
      </section>
    </div>
  );
}

export function DashboardPage({ accessToken, workspaceId, workspaceName }: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<DashboardSummary>("/api/v1/dashboard/summary", { method: "GET", accessToken, workspaceId });
      setSummary(data);
      setUpdatedAt(new Date());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(key: DetailKey) {
    setDetailKey(key);
    setDetailRows([]);
    setDetailTotal(0);
    setDetailError("");
    setDetailLoading(true);
    try {
      if (key.startsWith("process-")) {
        const params = new URLSearchParams({ limit: "200" });
        if (key === "process-progress") params.set("status", "Em andamento");
        if (key === "process-critical") params.set("attention", "true");
        if (key === "process-completed") params.set("status", "Concluído");
        const data = await apiRequest<ProcessList>(`/api/v1/processes?${params}`, { method: "GET", accessToken, workspaceId });
        setDetailTotal(data.total);
        setDetailRows(data.items.map((process) => ({
          id: process.id,
          title: process.client,
          subtitle: `${process.number || "Sem número"} · ${process.process_type || "Processo"}${process.next_action ? ` · ${process.next_action}` : ""}`,
          badge: key === "process-critical" ? formatDate(process.due_date) : process.status,
        })));
        return;
      }

      const data = await apiRequest<FinancialEntryList>("/api/v1/financial-entries", { method: "GET", accessToken, workspaceId });
      const today = localDateKey();
      const rows: DetailRow[] = [];
      for (const entry of data.items) {
        if (entry.is_installment) {
          for (const installment of entry.installments) {
            const base: DetailRow = {
              id: installment.id,
              title: entry.description,
              subtitle: `Parcela ${installment.number}/${installment.total_installments} · vencimento ${formatDate(installment.due_date)}`,
              badge: entry.category,
              amount: Number(installment.amount),
            };
            if (key === "finance-receivable" && installment.status === "pendente") rows.push(base);
            if (key === "finance-overdue" && installment.status === "pendente" && installment.due_date < today) rows.push(base);
            if ((key === "finance-received" || key === "finance-balance") && installment.status === "recebida") rows.push({ ...base, subtitle: `${base.subtitle} · recebido em ${formatDate(installment.received_date)}` });
          }
          continue;
        }
        if (entry.kind === "receita" && (key === "finance-received" || key === "finance-balance")) {
          rows.push({ id: entry.id, title: entry.description, subtitle: `${formatDate(entry.entry_date)} · ${entry.category}`, badge: "Receita", amount: Number(entry.amount) });
        }
        if (entry.kind === "despesa" && key === "finance-balance") {
          rows.push({ id: entry.id, title: entry.description, subtitle: `${formatDate(entry.entry_date)} · ${entry.category}`, badge: "Despesa", amount: -Number(entry.amount) });
        }
      }
      setDetailRows(rows);
      setDetailTotal(rows.length);
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : "Não foi possível carregar os detalhes.");
    } finally {
      setDetailLoading(false);
    }
  }

  const total = summary?.processes.total ?? 0;
  const completed = summary?.processes.completed ?? 0;
  const completedPercent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <>
      <section className="page-head dashboard-heading">
        <div><p className="eyebrow">VISÃO GERAL</p><h2>{workspaceName}</h2><p>Acompanhe processos, prazos e resultados financeiros em um só lugar.</p></div>
        <div className="refresh-block">
          {updatedAt && <small>Atualizado às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}
          <button className="ghost-btn" onClick={() => void load()} disabled={loading}>↻ {loading ? "Atualizando…" : "Atualizar"}</button>
        </div>
      </section>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {loading && !summary ? <section className="panel dashboard-loading" aria-live="polite">Carregando indicadores…</section> : summary ? (
        <div className="dashboard-content">
          <section aria-labelledby="process-metrics-title">
            <div className="section-title-row"><div><p className="eyebrow">PROCESSOS</p><h3 id="process-metrics-title">Situação do escritório</h3></div></div>
            <div className="dashboard-grid">
              <MetricCard tone="blue" icon="▣" label="TOTAL" value={summary.processes.total} detail="Processos cadastrados" onClick={() => void openDetail("process-total")} />
              <MetricCard tone="blue" icon="↻" label="EM ANDAMENTO" value={summary.processes.in_progress} detail="Trabalho em curso" onClick={() => void openDetail("process-progress")} />
              <MetricCard tone="orange" icon="!" label="PRAZOS CRÍTICOS" value={summary.processes.critical_deadlines} detail="Exigem atenção" onClick={() => void openDetail("process-critical")} />
              <MetricCard tone="green" icon="✓" label="CONCLUÍDOS" value={summary.processes.completed} detail="Processos finalizados" onClick={() => void openDetail("process-completed")} />
            </div>
          </section>
          <section className="panel progress-panel" aria-labelledby="progress-title">
            <div className="progress-copy"><div><p className="eyebrow">PROGRESSO</p><h3 id="progress-title">Conclusão dos processos</h3></div><strong>{completedPercent}%</strong></div>
            <div className="progress-track" aria-label={`${completedPercent}% dos processos concluídos`}><span style={{ width: `${completedPercent}%` }} /></div>
            <p>{completed} de {total} processo(s) concluído(s).</p>
          </section>
          <section aria-labelledby="finance-metrics-title">
            <div className="section-title-row"><div><p className="eyebrow">FINANCEIRO</p><h3 id="finance-metrics-title">Resumo financeiro</h3></div></div>
            <div className="dashboard-grid finance-dashboard-grid">
              <MetricCard tone="orange" icon="⌛" label="A RECEBER" value={money(summary.finances.receivable)} detail="Valores pendentes" onClick={() => void openDetail("finance-receivable")} />
              <MetricCard tone="green" icon="↓" label="RECEBIDO" value={money(summary.finances.received)} detail="Entradas confirmadas" onClick={() => void openDetail("finance-received")} />
              <MetricCard tone="red" icon="!" label="EM ATRASO" value={money(summary.finances.overdue)} detail="Recebimentos vencidos" onClick={() => void openDetail("finance-overdue")} />
              <MetricCard tone={Number(summary.finances.balance) >= 0 ? "blue" : "red"} icon="R$" label="SALDO" value={money(summary.finances.balance)} detail="Receitas menos despesas" onClick={() => void openDetail("finance-balance")} />
            </div>
          </section>
        </div>
      ) : <section className="panel dashboard-loading"><strong>Não foi possível exibir os indicadores.</strong><button className="ghost-btn" onClick={() => void load()}>Tentar novamente</button></section>}
      {detailKey && <DetailModal detailKey={detailKey} rows={detailRows} total={detailTotal} loading={detailLoading} error={detailError} onClose={() => setDetailKey(null)} />}
    </>
  );
}
