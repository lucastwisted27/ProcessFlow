import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "./lib/api";
import type {
  DjenOverview,
  DjenPublication,
  DjenSubscription,
  DjenSyncResult,
  ProcessRecord,
} from "./types";

interface DjenPageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  onOpenProcess: (process: ProcessRecord) => void;
}

const EMPTY_OVERVIEW: DjenOverview = {
  subscriptions: [],
  publications: [],
  stats: { total: 0, unread: 0, today: 0, linked: 0 },
  last_synced_at: null,
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function isSyncedToday(value: string | null): boolean {
  if (!value) return false;
  const synced = new Date(value);
  const today = new Date();
  return synced.getFullYear() === today.getFullYear() && synced.getMonth() === today.getMonth() && synced.getDate() === today.getDate();
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function PublicationModal({ publication, busy, onClose, onToggleRead, onOpenProcess }: {
  publication: DjenPublication;
  busy: boolean;
  onClose: () => void;
  onToggleRead: () => void;
  onOpenProcess: () => void;
}) {
  return <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal-card djen-publication-modal" role="dialog" aria-modal="true" aria-labelledby="djen-publication-title">
      <header className="modal-head">
        <div><p className="eyebrow">{publication.tribunal} · {formatDate(publication.publication_date)}</p><h2 id="djen-publication-title">{publication.communication_type || "Publicação DJEN"}</h2><span>{publication.process_number_formatted || "Processo não informado"}</span></div>
        <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      <div className="djen-publication-detail">
        <div className="djen-detail-meta">
          <div><span>Órgão</span><strong>{publication.court_body || "Não informado"}</strong></div>
          <div><span>Documento</span><strong>{publication.document_type || publication.medium}</strong></div>
          <div><span>OAB encontrada</span><strong>{publication.matched_oabs.join(", ")}</strong></div>
          <div><span>Vínculo</span><strong>{publication.process ? publication.process.client : "Sem processo correspondente"}</strong></div>
        </div>
        {publication.recipients.length > 0 && <div className="djen-people"><span>DESTINATÁRIOS</span><p>{publication.recipients.join(" · ")}</p></div>}
        <article className="djen-full-text"><span>INTEIRO TEOR</span><p>{publication.content || "O DJEN não forneceu o texto desta publicação."}</p></article>
        <div className="djen-disclaimer">O ProcessFlow auxilia no acompanhamento. Confirme prazos e efeitos processuais na publicação e no sistema oficial do tribunal.</div>
      </div>
      <footer className="modal-actions djen-modal-actions">
        <button className="ghost-btn" onClick={onToggleRead} disabled={busy}>{publication.is_read ? "Marcar como não lida" : "Marcar como lida"}</button>
        {publication.process && <button className="ghost-btn" onClick={onOpenProcess}>Abrir processo vinculado</button>}
        {publication.official_link && <a className="primary-btn djen-official-link" href={publication.official_link} target="_blank" rel="noreferrer">Abrir fonte oficial ↗</a>}
      </footer>
    </section>
  </div>;
}

export function DjenPage({ accessToken, workspaceId, workspaceName, onOpenProcess }: DjenPageProps) {
  const [overview, setOverview] = useState<DjenOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [selected, setSelected] = useState<DjenPublication | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [lawyerName, setLawyerName] = useState("");
  const [oabNumber, setOabNumber] = useState("");
  const [oabState, setOabState] = useState("");
  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | null>(null);
  const autoSyncAttempted = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (unreadOnly) params.set("unread_only", "true");
    if (linkedOnly) params.set("linked_only", "true");
    try {
      const data = await apiRequest<DjenOverview>(`/api/v1/djen?${params}`, { method: "GET", accessToken, workspaceId });
      setOverview(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as publicações.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, linkedOnly, search, unreadOnly, workspaceId]);

  useEffect(() => {
    autoSyncAttempted.current = false;
    setActiveSubscriptionId(null);
  }, [workspaceId]);

  useEffect(() => {
    if (activeSubscriptionId === null && overview.subscriptions.length > 0) {
      setActiveSubscriptionId(overview.subscriptions[0].id);
    } else if (activeSubscriptionId && activeSubscriptionId !== "all" && !overview.subscriptions.some((item) => item.id === activeSubscriptionId)) {
      setActiveSubscriptionId(overview.subscriptions[0]?.id ?? null);
    }
  }, [activeSubscriptionId, overview.subscriptions]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const sync = useCallback(async (automatic = false) => {
    setSyncing(true);
    if (!automatic) setNotice("");
    try {
      let result: DjenSyncResult;
      try {
        result = await apiRequest<DjenSyncResult>("/api/v1/djen/sync?days=7", { method: "POST", accessToken, workspaceId });
        if (result.warnings.length > 0) throw new Error("Consulta parcial pelo servidor.");
      } catch {
        // Alguns datacenters são recusados pelo firewall do CNJ. A API pública libera CORS,
        // então o navegador consulta a fonte oficial e entrega o resultado ao nosso backend.
        const aggregate: DjenSyncResult = { fetched: 0, created: 0, linked: 0, warnings: [] };
        for (const subscription of overview.subscriptions) {
          const today = new Date();
          const oldest = addDays(today, subscription.last_synced_at ? -7 : -30);
          if (subscription.last_synced_at) {
            const lastSync = addDays(new Date(subscription.last_synced_at), -1);
            if (lastSync > oldest) oldest.setTime(lastSync.getTime());
          }
          const items: unknown[] = [];
          for (let page = 1; page <= 10; page += 1) {
            const url = new URL("https://comunicaapi.pje.jus.br/api/v1/comunicacao");
            url.search = new URLSearchParams({
              numeroOab: subscription.oab_number,
              ufOab: subscription.oab_state,
              dataDisponibilizacaoInicio: localDateKey(oldest),
              dataDisponibilizacaoFim: localDateKey(today),
              pagina: String(page),
              itensPorPagina: "100",
            }).toString();
            const response = await fetch(url);
            if (response.status === 429) throw new Error("O CNJ limitou temporariamente as consultas. Aguarde 1 minuto e tente novamente.");
            if (!response.ok) throw new Error(`O CNJ recusou a consulta da OAB/${subscription.oab_state} ${subscription.oab_number} (erro ${response.status}).`);
            const payload = await response.json() as { items?: unknown[] };
            const pageItems = Array.isArray(payload.items) ? payload.items : [];
            items.push(...pageItems);
            if (pageItems.length < 100) break;
          }
          const ingested = await apiRequest<DjenSyncResult>("/api/v1/djen/ingest", {
            method: "POST", accessToken, workspaceId,
            body: JSON.stringify({ subscription_id: subscription.id, items }),
          });
          aggregate.fetched += ingested.fetched;
          aggregate.created += ingested.created;
          aggregate.linked += ingested.linked;
          aggregate.warnings.push(...ingested.warnings);
        }
        result = aggregate;
      }
      setNotice(result.created > 0 ? `${result.created} nova(s) publicação(ões) encontrada(s); ${result.linked} vínculo(s) com processos.` : "Consulta concluída. Nenhuma publicação nova no período consultado.");
      if (result.warnings.length > 0) setError(result.warnings.join(" "));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível consultar o DJEN.");
    } finally {
      setSyncing(false);
    }
  }, [accessToken, load, overview.subscriptions, workspaceId]);

  useEffect(() => {
    if (loading || autoSyncAttempted.current || overview.subscriptions.length === 0 || isSyncedToday(overview.last_synced_at)) return;
    autoSyncAttempted.current = true;
    void sync(true);
  }, [loading, overview.last_synced_at, overview.subscriptions.length, sync]);

  async function addSubscription(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await apiRequest<DjenSubscription>("/api/v1/djen/subscriptions", {
        method: "POST", accessToken, workspaceId,
        body: JSON.stringify({ lawyer_name: lawyerName, oab_number: oabNumber, oab_state: oabState }),
      });
      setActiveSubscriptionId(created.id);
      setLawyerName("");
      setOabNumber("");
      setOabState("");
      autoSyncAttempted.current = true;
      await load();
      await sync(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível cadastrar a OAB.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSubscription(subscription: DjenSubscription) {
    if (!window.confirm(`Remover o acompanhamento da OAB ${subscription.oab_state} ${subscription.oab_number}? As publicações já salvas serão mantidas.`)) return;
    try {
      await apiRequest<void>(`/api/v1/djen/subscriptions/${subscription.id}`, { method: "DELETE", accessToken, workspaceId });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível remover a OAB.");
    }
  }

  async function openPublication(publication: DjenPublication) {
    setSelected(publication);
    if (publication.is_read) return;
    try {
      const updated = await apiRequest<DjenPublication>(`/api/v1/djen/publications/${publication.id}/read`, { method: "PATCH", accessToken, workspaceId, body: JSON.stringify({ is_read: true }) });
      setSelected(updated);
      setOverview((current) => ({ ...current, stats: { ...current.stats, unread: Math.max(0, current.stats.unread - 1) }, publications: current.publications.map((item) => item.id === updated.id ? updated : item) }));
    } catch {
      // A leitura continua disponível mesmo se a marcação falhar.
    }
  }

  async function toggleRead() {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await apiRequest<DjenPublication>(`/api/v1/djen/publications/${selected.id}/read`, { method: "PATCH", accessToken, workspaceId, body: JSON.stringify({ is_read: !selected.is_read }) });
      setSelected(updated);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar a leitura.");
    } finally {
      setSaving(false);
    }
  }

  async function openLinkedProcess(publication: DjenPublication) {
    if (!publication.process) return;
    try {
      const process = await apiRequest<ProcessRecord>(`/api/v1/processes/${publication.process.id}`, { method: "GET", accessToken, workspaceId });
      onOpenProcess(process);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível abrir o processo.");
    }
  }

  const activeSubscription = overview.subscriptions.find((item) => item.id === activeSubscriptionId) ?? null;
  const activeOabLabel = activeSubscription ? `${activeSubscription.oab_state} ${activeSubscription.oab_number}` : "";
  const visiblePublications = activeSubscriptionId === "all" || !activeSubscription
    ? overview.publications
    : overview.publications.filter((publication) => publication.matched_oabs.includes(activeOabLabel));
  const todayKey = localDateKey(new Date());
  const visibleStats = activeSubscriptionId === "all" || !activeSubscription ? overview.stats : {
    total: visiblePublications.length,
    unread: visiblePublications.filter((publication) => !publication.is_read).length,
    today: visiblePublications.filter((publication) => publication.publication_date === todayKey).length,
    linked: visiblePublications.filter((publication) => publication.process !== null).length,
  };

  return <>
    <section className="page-head djen-heading">
      <div><p className="eyebrow">ATUALIZAÇÕES DIÁRIAS</p><h2>Publicações DJEN</h2><p>{workspaceName} · consulta oficial por OAB e vínculo automático com os processos.</p></div>
      <div className="djen-head-actions"><button className="ghost-btn" onClick={() => setShowSettings((value) => !value)}>⚙ OABs monitoradas</button><button className="primary-btn" disabled={syncing || overview.subscriptions.length === 0} onClick={() => void sync(false)}>↻ {syncing ? "Consultando CNJ…" : "Buscar atualizações"}</button></div>
    </section>
    <div className="djen-safety-note"><strong>Fonte oficial: Diário de Justiça Eletrônico Nacional.</strong><span>A consulta é atualizada automaticamente uma vez ao dia quando o escritório acessa esta página. Sempre confira o inteiro teor e o sistema do tribunal.</span>{overview.last_synced_at && <small>Última consulta: {new Date(overview.last_synced_at).toLocaleString("pt-BR")}</small>}</div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {notice && <div className="success-banner" role="status">{notice}</div>}

    {(showSettings || overview.subscriptions.length === 0) && <section className="panel djen-settings">
      <header className="panel-head"><div><p className="eyebrow">MONITORAMENTO</p><h3>Inscrições da OAB</h3></div></header>
      <div className="djen-settings-body">
        <form onSubmit={addSubscription}>
          <label>Nome do advogado<input value={lawyerName} onChange={(event) => setLawyerName(event.target.value)} placeholder="Ex.: Carlos Andrade" /></label>
          <label>Número da OAB<input required value={oabNumber} onChange={(event) => setOabNumber(event.target.value)} placeholder="Ex.: 12345" /></label>
          <label>UF<input required minLength={2} maxLength={2} value={oabState} onChange={(event) => setOabState(event.target.value.toUpperCase())} placeholder="AM" /></label>
          <button className="primary-btn" disabled={saving}>{saving ? "Salvando…" : "＋ Monitorar OAB"}</button>
        </form>
        <div className="djen-subscription-list">
          {overview.subscriptions.length === 0 ? <p>Nenhuma OAB cadastrada. Informe cada inscrição principal ou suplementar usada pelo escritório.</p> : overview.subscriptions.map((subscription) => <div key={subscription.id}><span><strong>{subscription.lawyer_name || "Advogado"}</strong><small>OAB/{subscription.oab_state} {subscription.oab_number}</small></span><button onClick={() => void removeSubscription(subscription)} aria-label={`Remover OAB ${subscription.oab_state} ${subscription.oab_number}`}>×</button></div>)}
        </div>
      </div>
    </section>}

    {overview.subscriptions.length > 0 && <section className="djen-account-switcher" aria-label="Selecionar inscrição da OAB">
      <div><p className="eyebrow">CARTEIRA EM EXIBIÇÃO</p><strong>{activeSubscription ? activeSubscription.lawyer_name || `OAB/${activeSubscription.oab_state} ${activeSubscription.oab_number}` : "Todas as inscrições"}</strong><span>{activeSubscription ? `Mostrando somente publicações da OAB/${activeSubscription.oab_state} ${activeSubscription.oab_number}` : "Visão consolidada de todas as OABs monitoradas"}</span></div>
      <div className="djen-account-tabs">
        {overview.subscriptions.map((subscription) => <button className={activeSubscriptionId === subscription.id ? "active" : ""} key={subscription.id} onClick={() => setActiveSubscriptionId(subscription.id)}>
          <span>{(subscription.lawyer_name || "OAB").split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
          <b>{subscription.lawyer_name || "Advogado"}<small>OAB/{subscription.oab_state} {subscription.oab_number}</small></b>
        </button>)}
        {overview.subscriptions.length > 1 && <button className={activeSubscriptionId === "all" ? "active" : ""} onClick={() => setActiveSubscriptionId("all")}><span>∑</span><b>Todas<small>Visão consolidada</small></b></button>}
      </div>
    </section>}

    <section className="metrics-grid djen-metrics">
      <div className="metric blue"><span>HOJE</span><strong>{visibleStats.today}</strong><small>Publicações de hoje</small></div>
      <div className="metric orange"><span>NÃO LIDAS</span><strong>{visibleStats.unread}</strong><small>Exigem conferência</small></div>
      <div className="metric green"><span>VINCULADAS</span><strong>{visibleStats.linked}</strong><small>Ligadas a processos</small></div>
      <div className="metric blue"><span>TOTAL</span><strong>{visibleStats.total}</strong><small>{activeSubscription ? `OAB/${activeSubscription.oab_state} ${activeSubscription.oab_number}` : "Publicações armazenadas"}</small></div>
    </section>

    <section className="toolbar djen-toolbar" aria-label="Filtros das publicações">
      <label className="search-box">⌕<input placeholder="Buscar processo, tribunal, órgão ou texto…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className="check-filter"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> Somente não lidas</label>
      <label className="check-filter"><input type="checkbox" checked={linkedOnly} onChange={(event) => setLinkedOnly(event.target.checked)} /> Com processo vinculado</label>
    </section>

    <section className="panel djen-feed">
      {loading ? <div className="empty-state">Carregando publicações…</div> : overview.subscriptions.length === 0 ? <div className="empty-state"><strong>Cadastre a OAB para começar.</strong><span>Não é necessário informar senha ou certificado digital.</span></div> : visiblePublications.length === 0 ? <div className="empty-state"><strong>Nenhuma publicação encontrada para esta OAB.</strong><span>Faça uma consulta ou ajuste os filtros.</span></div> : visiblePublications.map((publication) => <button className={`djen-card ${publication.is_read ? "read" : "unread"}`} key={publication.id} onClick={() => void openPublication(publication)}>
        <div className="djen-card-date"><strong>{new Date(`${publication.publication_date}T12:00:00`).getDate()}</strong><span>{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${publication.publication_date}T12:00:00`))}</span></div>
        <div className="djen-card-copy"><div>{!publication.is_read && <b>NOVA</b>}<span>{publication.tribunal}</span><span>{publication.communication_type}</span>{publication.process && <em>PROCESSO VINCULADO</em>}</div><strong>{publication.process_number_formatted || publication.document_type || "Publicação DJEN"}</strong><small>{publication.court_body || publication.medium}</small><p>{publication.content.slice(0, 260)}{publication.content.length > 260 ? "…" : ""}</p></div>
        <i>LER →</i>
      </button>)}
    </section>
    <p className="djen-source">Integração com a <a href="https://comunicaapi.pje.jus.br/swagger/index.html" target="_blank" rel="noreferrer">API pública do DJEN/CNJ ↗</a>.</p>
    {selected && <PublicationModal publication={selected} busy={saving} onClose={() => setSelected(null)} onToggleRead={() => void toggleRead()} onOpenProcess={() => void openLinkedProcess(selected)} />}
  </>;
}
