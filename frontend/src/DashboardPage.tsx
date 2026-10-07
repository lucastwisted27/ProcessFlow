import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "./lib/api";
import type { DashboardSummary, FinancialEntryList, ProcessList, ProcessRecord } from "./types";

interface DashboardPageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  onOpenProcess: (process: ProcessRecord) => void;
}

type DetailKey =
  | "process-total"
  | "process-progress"
  | "process-critical"
  | "process-completed"
  | "process-stayed"
  | "process-awaiting-payment"
  | "process-awaiting-opposing"
  | "process-decision"
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
  "process-stayed": { eyebrow: "PROCESSOS", title: "Processos sobrestados", empty: "Nenhum processo sobrestado." },
  "process-awaiting-payment": { eyebrow: "PROCESSOS", title: "Aguardando pagamento", empty: "Nenhum processo aguardando pagamento." },
  "process-awaiting-opposing": { eyebrow: "PROCESSOS", title: "Aguardando manifestação contrária", empty: "Nenhum processo aguardando manifestação contrária." },
  "process-decision": { eyebrow: "PROCESSOS", title: "Ciência de decisão", empty: "Nenhum processo em ciência de decisão." },
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

export function DashboardPage({ accessToken, workspaceId, workspaceName, onOpenProcess }: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [processes, setProcesses] = useState<ProcessRecord[]>([]);
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, processList] = await Promise.all([
        apiRequest<DashboardSummary>("/api/v1/dashboard/summary", { method: "GET", accessToken, workspaceId }),
        apiRequest<ProcessList>("/api/v1/processes?limit=200", { method: "GET", accessToken, workspaceId }),
      ]);
      setSummary(data);
      setProcesses(processList.items);
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
        const criticalLimit = new Date();
        criticalLimit.setHours(12, 0, 0, 0);
        criticalLimit.setDate(criticalLimit.getDate() + 3);
        const filtered = processes.filter((process) => {
          if (key === "process-progress") return process.status === "Em andamento";
          if (key === "process-completed") return process.status === "Concluído";
          if (key === "process-stayed") return process.status === "Sobrestado";
          if (key === "process-awaiting-payment") return process.status === "Aguardando Pagamento";
          if (key === "process-awaiting-opposing") return process.status === "Aguardando Manifestação Contrária";
          if (key === "process-decision") return process.status === "Ciência de Decisão";
          if (key === "process-critical") return process.status !== "Concluído" && Boolean(process.due_date) && new Date(`${process.due_date}T12:00:00`) <= criticalLimit;
          return true;
        });
        setDetailTotal(filtered.length);
        setDetailRows(filtered.map((process) => ({
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
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const deadlineProcesses = processes
    .filter((process) => process.status !== "Concluído" && process.due_date)
    .map((process) => ({
      process,
      days: Math.round((new Date(`${process.due_date}T12:00:00`).getTime() - today.getTime()) / 86_400_000),
    }))
    .filter((item) => item.days <= 7)
    .sort((first, second) => first.days - second.days);
  const overdueCount = deadlineProcesses.filter((item) => item.days < 0).length;
  const todayCount = deadlineProcesses.filter((item) => item.days === 0).length;
  const upcomingCount = deadlineProcesses.filter((item) => item.days > 0).length;

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
      {!loading && <section className={`panel deadline-command-center ${deadlineProcesses.length > 0 ? "has-deadlines" : "clear"}`} aria-labelledby="deadline-center-title">
        <header>
          <div><p className="eyebrow">CENTRAL DE PRAZOS</p><h3 id="deadline-center-title">Prazos que exigem atenção</h3><span>Visão imediata dos vencidos e dos próximos 7 dias.</span></div>
          <div className="deadline-summary-badges"><b className="overdue">{overdueCount}<small>vencido(s)</small></b><b className="today">{todayCount}<small>hoje</small></b><b className="upcoming">{upcomingCount}<small>próximos</small></b></div>
        </header>
        {deadlineProcesses.length === 0 ? <div className="deadline-center-empty">✓ Nenhum prazo vencido ou previsto para os próximos 7 dias.</div> : <div className="deadline-center-list">
          {deadlineProcesses.slice(0, 8).map(({ process, days }) => <button key={process.id} onClick={() => onOpenProcess(process)}>
            <span className={days < 0 ? "overdue" : days === 0 ? "today" : "upcoming"}>{days < 0 ? `${Math.abs(days)} dia(s) atrasado` : days === 0 ? "Vence hoje" : days === 1 ? "Vence amanhã" : `Vence em ${days} dias`}</span>
            <strong>{process.client}</strong>
            <small>{formatDate(process.due_date)} · {process.number || "Sem número"}{process.next_action ? ` · ${process.next_action}` : ""}</small>
            <i>ABRIR →</i>
          </button>)}
        </div>}
      </section>}
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
            <div className="dashboard-grid dashboard-status-grid">
              <MetricCard tone="orange" icon="Ⅱ" label="SOBRESTADOS" value={summary.processes.stayed} detail="Temporariamente suspensos" onClick={() => void openDetail("process-stayed")} />
              <MetricCard tone="green" icon="R$" label="AGUARDANDO PAGAMENTO" value={summary.processes.awaiting_payment} detail="Pagamento pendente" onClick={() => void openDetail("process-awaiting-payment")} />
              <MetricCard tone="blue" icon="↔" label="MANIFESTAÇÃO CONTRÁRIA" value={summary.processes.awaiting_opposing_manifestation} detail="Aguardando a outra parte" onClick={() => void openDetail("process-awaiting-opposing")} />
              <MetricCard tone="red" icon="!" label="CIÊNCIA DE DECISÃO" value={summary.processes.decision_acknowledgment} detail="Decisão para análise" onClick={() => void openDetail("process-decision")} />
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
