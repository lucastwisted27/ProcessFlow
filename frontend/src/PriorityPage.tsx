import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "./lib/api";
import type { PriorityItem, PriorityItemType } from "./types";

type PriorityFilter = "pending" | "balcao" | "inicial" | "completed";
type MissingDocumentValue = "" | "true" | "false";

interface PriorityDraft {
  item_type: PriorityItemType;
  process_number: string;
  name: string;
  counterparty: string;
  request_text: string;
  response_text: string;
  missing_document: MissingDocumentValue;
  notes: string;
  completed: boolean;
}

const EMPTY_DRAFT: PriorityDraft = {
  item_type: "balcao",
  process_number: "",
  name: "",
  counterparty: "",
  request_text: "",
  response_text: "",
  missing_document: "",
  notes: "",
  completed: false,
};

function draftFromItem(item: PriorityItem): PriorityDraft {
  return {
    item_type: item.item_type,
    process_number: item.process_number,
    name: item.name,
    counterparty: item.counterparty,
    request_text: item.request_text,
    response_text: item.response_text,
    missing_document: item.missing_document === null ? "" : String(item.missing_document) as MissingDocumentValue,
    notes: item.notes,
    completed: item.completed,
  };
}

function updatedAt(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function PriorityPage({ accessToken, workspaceId, workspaceName }: { accessToken: string; workspaceId: string; workspaceName: string }) {
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [filter, setFilter] = useState<PriorityFilter>("pending");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<PriorityItem | null>(null);
  const [draft, setDraft] = useState<PriorityDraft>(EMPTY_DRAFT);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiRequest<PriorityItem[]>("/api/v1/priorities", { method: "GET", accessToken, workspaceId }));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as prioridades.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    pending: items.filter((item) => !item.completed).length,
    balcao: items.filter((item) => item.item_type === "balcao" && !item.completed).length,
    inicial: items.filter((item) => item.item_type === "inicial" && !item.completed).length,
    completed: items.filter((item) => item.completed).length,
  }), [items]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      if (filter === "pending" && item.completed) return false;
      if (filter === "completed" && !item.completed) return false;
      if ((filter === "balcao" || filter === "inicial") && (item.item_type !== filter || item.completed)) return false;
      if (!normalized) return true;
      return [item.process_number, item.name, item.counterparty, item.request_text, item.response_text, item.notes]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized));
    });
  }, [filter, items, query]);

  function openCreate(itemType: PriorityItemType) {
    setSelected(null);
    setDraft({ ...EMPTY_DRAFT, item_type: itemType });
    setModalOpen(true);
    setError("");
  }

  function openEdit(item: PriorityItem) {
    setSelected(item);
    setDraft(draftFromItem(item));
    setModalOpen(true);
    setError("");
  }

  function closeModal() {
    setModalOpen(false);
    setSelected(null);
  }

  function payload() {
    return {
      ...draft,
      missing_document: draft.missing_document === "" ? null : draft.missing_document === "true",
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (selected) {
        const updated = await apiRequest<PriorityItem>(`/api/v1/priorities/${selected.id}`, {
          method: "PATCH", accessToken, workspaceId, body: JSON.stringify(payload()),
        });
        setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
      } else {
        const created = await apiRequest<PriorityItem>("/api/v1/priorities", {
          method: "POST", accessToken, workspaceId, body: JSON.stringify(payload()),
        });
        setItems((current) => [created, ...current]);
      }
      closeModal();
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a prioridade.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCompleted(item: PriorityItem) {
    setSaving(true);
    try {
      const updated = await apiRequest<PriorityItem>(`/api/v1/priorities/${item.id}`, {
        method: "PATCH", accessToken, workspaceId, body: JSON.stringify({ completed: !item.completed }),
      });
      setItems((current) => current.map((currentItem) => currentItem.id === updated.id ? updated : currentItem));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar a prioridade.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    if (!selected || !window.confirm("Excluir esta prioridade definitivamente?")) return;
    setSaving(true);
    try {
      await apiRequest<void>(`/api/v1/priorities/${selected.id}`, { method: "DELETE", accessToken, workspaceId });
      setItems((current) => current.filter((item) => item.id !== selected.id));
      closeModal();
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir a prioridade.");
    } finally {
      setSaving(false);
    }
  }

  const balcao = visible.filter((item) => item.item_type === "balcao");
  const iniciais = visible.filter((item) => item.item_type === "inicial");

  return <>
    <section className="page-head priority-heading"><div><p className="eyebrow">ORGANIZAÇÃO DO ESCRITÓRIO</p><h2>Prioridades a fazer</h2><p>{workspaceName} · acompanhe solicitações do Balcão Virtual e iniciais pendentes.</p></div><div className="priority-heading-actions"><button className="ghost-btn" onClick={() => openCreate("balcao")}>＋ Balcão Virtual</button><button className="primary-btn" onClick={() => openCreate("inicial")}>＋ Nova inicial</button></div></section>

    <section className="metrics-grid priority-metrics" aria-label="Filtros de prioridades">
      <button className={`metric priority-metric blue ${filter === "pending" ? "active" : ""}`} onClick={() => setFilter("pending")}><span>PENDENTES</span><strong>{counts.pending}</strong><small>Tudo que exige atenção</small><em>Ver pendências →</em></button>
      <button className={`metric priority-metric orange ${filter === "balcao" ? "active" : ""}`} onClick={() => setFilter("balcao")}><span>BALCÃO VIRTUAL</span><strong>{counts.balcao}</strong><small>Solicitações em aberto</small><em>Ver solicitações →</em></button>
      <button className={`metric priority-metric green ${filter === "inicial" ? "active" : ""}`} onClick={() => setFilter("inicial")}><span>INICIAIS A FAZER</span><strong>{counts.inicial}</strong><small>Novos trabalhos</small><em>Ver iniciais →</em></button>
      <button className={`metric priority-metric ${filter === "completed" ? "active" : ""}`} onClick={() => setFilter("completed")}><span>CONCLUÍDAS</span><strong>{counts.completed}</strong><small>Histórico finalizado</small><em>Ver concluídas →</em></button>
    </section>

    <section className="toolbar priority-toolbar"><label className="search-box">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por processo, parte, solicitação ou observação…" /></label><button className="ghost-btn" onClick={() => void load()}>↻ Atualizar</button></section>
    {error && <div className="error-banner" role="alert">{error}</div>}

    {loading ? <section className="panel"><div className="empty-state">Carregando prioridades…</div></section> : <div className="priority-boards">
      {(filter !== "inicial" || balcao.length > 0) && filter !== "inicial" && <section className="panel priority-board"><header className="panel-head"><div><p className="eyebrow">ACOMPANHAMENTO</p><h3>Balcão Virtual · {balcao.length}</h3></div><button className="ghost-btn" onClick={() => openCreate("balcao")}>＋ Adicionar</button></header><div className="priority-table-wrap"><div className="priority-table priority-table-balcao"><div className="priority-table-head"><span>Processo nº</span><span>Parte</span><span>Solicitação</span><span>Resposta</span><span>Situação</span></div>{balcao.length === 0 ? <div className="priority-empty">Nenhuma solicitação do Balcão Virtual neste filtro.</div> : balcao.map((item) => <article className={`priority-row ${item.completed ? "completed" : ""}`} key={item.id} tabIndex={0} role="button" onClick={() => openEdit(item)} onKeyDown={(event) => { if (event.key === "Enter") openEdit(item); }}><span data-label="Processo nº"><strong>{item.process_number || "Sem número"}</strong></span><span data-label="Parte">{item.name}</span><span data-label="Solicitação">{item.request_text || "—"}</span><span data-label="Resposta">{item.response_text || "Aguardando resposta"}</span><span data-label="Situação"><button className={item.completed ? "priority-done" : "priority-open"} disabled={saving} onClick={(event) => { event.stopPropagation(); void toggleCompleted(item); }}>{item.completed ? "✓ Concluído" : "Em aberto"}</button><small>Atualizado {updatedAt(item.updated_at)}</small></span></article>)}</div></div></section>}

      {(filter !== "balcao" || iniciais.length > 0) && filter !== "balcao" && <section className="panel priority-board"><header className="panel-head"><div><p className="eyebrow">PRODUÇÃO JURÍDICA</p><h3>Iniciais a Fazer · {iniciais.length}</h3></div><button className="primary-btn" onClick={() => openCreate("inicial")}>＋ Adicionar</button></header><div className="priority-table-wrap"><div className="priority-table priority-table-iniciais"><div className="priority-table-head"><span>Nome</span><span>Contra</span><span>Falta documento?</span><span>Observação</span><span>Situação</span></div>{iniciais.length === 0 ? <div className="priority-empty">Nenhuma inicial a fazer neste filtro.</div> : iniciais.map((item) => <article className={`priority-row ${item.completed ? "completed" : ""}`} key={item.id} tabIndex={0} role="button" onClick={() => openEdit(item)} onKeyDown={(event) => { if (event.key === "Enter") openEdit(item); }}><span data-label="Nome"><strong>{item.name}</strong></span><span data-label="Contra">{item.counterparty || "—"}</span><span data-label="Falta documento?"><b className={item.missing_document ? "document-missing" : "document-ready"}>{item.missing_document === null ? "Não informado" : item.missing_document ? "Sim" : "Não"}</b></span><span data-label="Observação">{item.notes || "—"}</span><span data-label="Situação"><button className={item.completed ? "priority-done" : "priority-open"} disabled={saving} onClick={(event) => { event.stopPropagation(); void toggleCompleted(item); }}>{item.completed ? "✓ Concluído" : "Em aberto"}</button><small>Atualizado {updatedAt(item.updated_at)}</small></span></article>)}</div></div></section>}
    </div>}

    {modalOpen && <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><section className="modal-card priority-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">{draft.item_type === "balcao" ? "BALCÃO VIRTUAL" : "INICIAIS A FAZER"}</p><h2>{selected ? "Editar prioridade" : draft.item_type === "balcao" ? "Nova solicitação" : "Nova inicial"}</h2></div><button className="icon-button" type="button" onClick={closeModal} aria-label="Fechar">×</button></header><form onSubmit={(event) => void save(event)}><div className="form-grid">
      {draft.item_type === "balcao" ? <><label>Processo nº<input required autoFocus value={draft.process_number} onChange={(event) => setDraft((current) => ({ ...current, process_number: event.target.value }))} placeholder="Ex.: 0237598-52.2025.8.04.1000" /></label><label>Parte<input required value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome da parte" /></label><label className="full">Solicitação<textarea required rows={4} value={draft.request_text} onChange={(event) => setDraft((current) => ({ ...current, request_text: event.target.value }))} placeholder="Descreva o pedido feito ao Balcão Virtual" /></label><label className="full">Resposta<textarea rows={3} value={draft.response_text} onChange={(event) => setDraft((current) => ({ ...current, response_text: event.target.value }))} placeholder="Resposta recebida ou situação atual" /></label></> : <><label>Nome<input required autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do cliente" /></label><label>Contra<input value={draft.counterparty} onChange={(event) => setDraft((current) => ({ ...current, counterparty: event.target.value }))} placeholder="Parte contrária" /></label><label>Falta documento?<select value={draft.missing_document} onChange={(event) => setDraft((current) => ({ ...current, missing_document: event.target.value as MissingDocumentValue }))}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select></label><label className="full">Observação<textarea rows={4} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Ex.: Fazer esta semana" /></label></>}
      <label className="check-line full"><input type="checkbox" checked={draft.completed} onChange={(event) => setDraft((current) => ({ ...current, completed: event.target.checked }))} /> Item concluído</label>
    </div><footer className="modal-actions priority-modal-actions">{selected ? <button type="button" className="danger-link" disabled={saving} onClick={() => void removeSelected()}>Excluir</button> : <span />}<div><button type="button" className="ghost-btn" onClick={closeModal}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving ? "Salvando…" : "Salvar prioridade"}</button></div></footer></form></section></div>}
  </>;
}
