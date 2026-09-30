import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "./lib/api";
import type { DashboardSummary } from "./types";

interface DashboardPageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
}

function money(value: number | string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function MetricCard({
  tone,
  icon,
  label,
  value,
  detail,
}: {
  tone: "blue" | "green" | "orange" | "red";
  icon: string;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className={`dashboard-metric ${tone}`}>
      <div className="dashboard-metric-head">
        <span>{label}</span>
        <b aria-hidden="true">{icon}</b>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function DashboardPage({ accessToken, workspaceId, workspaceName }: DashboardPageProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<DashboardSummary>("/api/v1/dashboard/summary", {
        method: "GET",
        accessToken,
        workspaceId,
      });
      setSummary(data);
      setUpdatedAt(new Date());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar o painel.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = summary?.processes.total ?? 0;
  const completed = summary?.processes.completed ?? 0;
  const completedPercent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <>
      <section className="page-head dashboard-heading">
        <div>
          <p className="eyebrow">VISÃO GERAL</p>
          <h2>{workspaceName}</h2>
          <p>Acompanhe processos, prazos e resultados financeiros em um só lugar.</p>
        </div>
        <div className="refresh-block">
          {updatedAt && (
            <small>
              Atualizado às {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </small>
          )}
          <button className="ghost-btn" onClick={() => void load()} disabled={loading}>
            ↻ {loading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {loading && !summary ? (
        <section className="panel dashboard-loading" aria-live="polite">
          Carregando indicadores…
        </section>
      ) : summary ? (
        <div className="dashboard-content">
          <section aria-labelledby="process-metrics-title">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">PROCESSOS</p>
                <h3 id="process-metrics-title">Situação do escritório</h3>
              </div>
            </div>
            <div className="dashboard-grid">
              <MetricCard tone="blue" icon="▣" label="TOTAL" value={summary.processes.total} detail="Processos cadastrados" />
              <MetricCard tone="blue" icon="↻" label="EM ANDAMENTO" value={summary.processes.in_progress} detail="Trabalho em curso" />
              <MetricCard tone="orange" icon="!" label="PRAZOS CRÍTICOS" value={summary.processes.critical_deadlines} detail="Exigem atenção" />
              <MetricCard tone="green" icon="✓" label="CONCLUÍDOS" value={summary.processes.completed} detail="Processos finalizados" />
            </div>
          </section>

          <section className="panel progress-panel" aria-labelledby="progress-title">
            <div className="progress-copy">
              <div>
                <p className="eyebrow">PROGRESSO</p>
                <h3 id="progress-title">Conclusão dos processos</h3>
              </div>
              <strong>{completedPercent}%</strong>
            </div>
            <div className="progress-track" aria-label={`${completedPercent}% dos processos concluídos`}>
              <span style={{ width: `${completedPercent}%` }} />
            </div>
            <p>
              {completed} de {total} processo(s) concluído(s).
            </p>
          </section>

          <section aria-labelledby="finance-metrics-title">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">FINANCEIRO</p>
                <h3 id="finance-metrics-title">Resumo financeiro</h3>
              </div>
            </div>
            <div className="dashboard-grid finance-dashboard-grid">
              <MetricCard tone="orange" icon="⌛" label="A RECEBER" value={money(summary.finances.receivable)} detail="Valores pendentes" />
              <MetricCard tone="green" icon="↓" label="RECEBIDO" value={money(summary.finances.received)} detail="Entradas confirmadas" />
              <MetricCard tone="red" icon="!" label="EM ATRASO" value={money(summary.finances.overdue)} detail="Recebimentos vencidos" />
              <MetricCard
                tone={Number(summary.finances.balance) >= 0 ? "blue" : "red"}
                icon="R$"
                label="SALDO"
                value={money(summary.finances.balance)}
                detail="Receitas menos despesas"
              />
            </div>
          </section>
        </div>
      ) : (
        <section className="panel dashboard-loading">
          <strong>Não foi possível exibir os indicadores.</strong>
          <button className="ghost-btn" onClick={() => void load()}>
            Tentar novamente
          </button>
        </section>
      )}
    </>
  );
}
