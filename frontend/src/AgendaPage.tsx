import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiRequest } from "./lib/api";
import type {
  AgendaEvent,
  AgendaEventStatus,
  AgendaEventType,
  AgendaOverview,
  ProcessList,
  ProcessRecord,
} from "./types";

interface AgendaPageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  onOpenProcess: (process: ProcessRecord) => void;
}

interface EventDraft {
  title: string;
  event_type: AgendaEventType;
  date: string;
  time: string;
  end_time: string;
  process_id: string;
  location: string;
  notes: string;
}

type CalendarItem =
  | { kind: "event"; dateKey: string; event: AgendaEvent }
  | { kind: "deadline"; dateKey: string; process: AgendaOverview["process_deadlines"][number] };

type AgendaMetric = "today" | "deadlines" | "hearings" | "scheduled";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_FORMAT = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const TIME_FORMAT = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function localDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function startOfCalendar(month: Date): Date {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  first.setDate(first.getDate() - first.getDay());
  return first;
}

function addDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function draftFor(date: string, event?: AgendaEvent): EventDraft {
  if (!event) {
    return {
      title: "",
      event_type: "Audiência",
      date,
      time: "09:00",
      end_time: "",
      process_id: "",
      location: "",
      notes: "",
    };
  }
  const startsAt = new Date(event.starts_at);
  const endsAt = event.ends_at ? new Date(event.ends_at) : null;
  return {
    title: event.title,
    event_type: event.event_type,
    date: localDateKey(startsAt),
    time: `${String(startsAt.getHours()).padStart(2, "0")}:${String(startsAt.getMinutes()).padStart(2, "0")}`,
    end_time: endsAt ? `${String(endsAt.getHours()).padStart(2, "0")}:${String(endsAt.getMinutes()).padStart(2, "0")}` : "",
    process_id: event.process_id ?? "",
    location: event.location,
    notes: event.notes,
  };
}

function EventModal({
  event,
  date,
  processes,
  processesLoading,
  processesError,
  busy,
  error,
  onClose,
  onSave,
  onReloadProcesses,
}: {
  event: AgendaEvent | null;
  date: string;
  processes: ProcessRecord[];
  processesLoading: boolean;
  processesError: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (draft: EventDraft) => Promise<void>;
  onReloadProcesses: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => draftFor(date, event ?? undefined));
  const [processSearch, setProcessSearch] = useState("");
  const filteredProcesses = useMemo(() => {
    const search = processSearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return processes;
    return processes.filter((process) => (
      `${process.client} ${process.number} ${process.process_type}`
        .toLocaleLowerCase("pt-BR")
        .includes(search)
    ));
  }, [processSearch, processes]);

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    await onSave(draft);
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(mouseEvent) => mouseEvent.target === mouseEvent.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="agenda-event-title">
        <header className="modal-head">
          <div><p className="eyebrow">AGENDA</p><h2 id="agenda-event-title">{event ? "Editar compromisso" : "Novo compromisso"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {error && <div className="detail-error error-banner" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="full">Título<input autoFocus required value={draft.title} onChange={(inputEvent) => setDraft({ ...draft, title: inputEvent.target.value })} placeholder="Ex.: Audiência de conciliação" /></label>
            <label>Tipo<select value={draft.event_type} onChange={(inputEvent) => setDraft({ ...draft, event_type: inputEvent.target.value as AgendaEventType })}><option>Audiência</option><option>Reunião</option><option>Compromisso</option><option>Lembrete</option></select></label>
            <label>Buscar processo<input value={processSearch} onChange={(inputEvent) => setProcessSearch(inputEvent.target.value)} placeholder="Cliente ou número do processo" /></label>
            <label className="full">Processo (opcional)<select value={draft.process_id} disabled={processesLoading} onChange={(inputEvent) => setDraft({ ...draft, process_id: inputEvent.target.value })}><option value="">{processesLoading ? "Carregando processos…" : "Sem processo vinculado"}</option>{filteredProcesses.map((process) => <option key={process.id} value={process.id}>{process.client} {process.number ? `· ${process.number}` : ""}</option>)}</select></label>
            {processesError && <div className="agenda-process-error full"><span>{processesError}</span><button type="button" className="link-button" onClick={() => void onReloadProcesses()}>Tentar carregar novamente</button></div>}
            <label>Data<input type="date" required value={draft.date} onChange={(inputEvent) => setDraft({ ...draft, date: inputEvent.target.value })} /></label>
            <label>Horário inicial<input type="time" required value={draft.time} onChange={(inputEvent) => setDraft({ ...draft, time: inputEvent.target.value })} /></label>
            <label>Horário final (opcional)<input type="time" value={draft.end_time} onChange={(inputEvent) => setDraft({ ...draft, end_time: inputEvent.target.value })} /></label>
            <label>Local ou link<input value={draft.location} onChange={(inputEvent) => setDraft({ ...draft, location: inputEvent.target.value })} placeholder="Fórum, escritório ou link da reunião" /></label>
            <label className="full">Observações<textarea rows={4} value={draft.notes} onChange={(inputEvent) => setDraft({ ...draft, notes: inputEvent.target.value })} /></label>
          </div>
          <footer className="modal-actions"><button type="button" className="ghost-btn" onClick={onClose}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? "Salvando…" : "Salvar compromisso"}</button></footer>
        </form>
      </section>
    </div>
  );
}

export function AgendaPage({ accessToken, workspaceId, workspaceName, onOpenProcess }: AgendaPageProps) {
  const today = localDateKey(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [selectedDate, setSelectedDate] = useState(today);
  const [overview, setOverview] = useState<AgendaOverview>({ events: [], process_deadlines: [], overdue_deadlines: [] });
  const [processes, setProcesses] = useState<ProcessRecord[]>([]);
  const [editing, setEditing] = useState<AgendaEvent | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [processesLoading, setProcessesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [processesError, setProcessesError] = useState("");
  const [modalError, setModalError] = useState("");
  const [activeMetric, setActiveMetric] = useState<AgendaMetric | null>(null);

  const calendarStart = useMemo(() => startOfCalendar(month), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index)), [calendarStart]);
  const calendarEnd = days[days.length - 1];
  const calendarStartKey = localDateKey(calendarStart);
  const calendarEndKey = localDateKey(calendarEnd);

  const loadAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start: localDateKey(calendarStart), end: localDateKey(calendarEnd) });
      const agenda = await apiRequest<AgendaOverview>(`/api/v1/agenda?${params}`, {
        method: "GET", accessToken, workspaceId,
      });
      setOverview(agenda);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a agenda.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, calendarEnd, calendarStart, workspaceId]);

  const loadProcesses = useCallback(async () => {
    setProcessesLoading(true);
    try {
      const processList = await apiRequest<ProcessList>("/api/v1/processes?limit=200", {
        method: "GET", accessToken, workspaceId,
      });
      setProcesses(processList.items);
      setProcessesError("");
    } catch (reason) {
      setProcessesError(reason instanceof Error
        ? reason.message
        : "Não foi possível carregar os processos para vinculação.");
    } finally {
      setProcessesLoading(false);
    }
  }, [accessToken, workspaceId]);

  useEffect(() => { void loadAgenda(); }, [loadAgenda]);
  useEffect(() => { void loadProcesses(); }, [loadProcesses]);

  const visibleEvents = overview.events.filter((event) => {
    const key = localDateKey(new Date(event.starts_at));
    return key >= calendarStartKey && key <= calendarEndKey;
  });
  const items = useMemo<CalendarItem[]>(() => [
    ...visibleEvents.map((event): CalendarItem => ({ kind: "event", dateKey: localDateKey(new Date(event.starts_at)), event })),
    ...overview.process_deadlines.map((process): CalendarItem => ({ kind: "deadline", dateKey: process.due_date.slice(0, 10), process })),
  ], [overview.process_deadlines, visibleEvents]);
  const itemsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) grouped.set(item.dateKey, [...(grouped.get(item.dateKey) ?? []), item]);
    return grouped;
  }, [items]);
  const selectedItems = itemsByDay.get(selectedDate) ?? [];
  const selectedLabel = DATE_FORMAT.format(dateFromKey(selectedDate));
  const activeEvents = visibleEvents.filter((event) => event.status === "agendado");
  const metrics = {
    today: (itemsByDay.get(today) ?? []).length,
    deadlines: overview.process_deadlines.length,
    hearings: activeEvents.filter((event) => event.event_type === "Audiência").length,
    scheduled: activeEvents.length,
  };
  const metricTitles: Record<AgendaMetric, string> = {
    today: "Itens de hoje",
    deadlines: "Prazos do período",
    hearings: "Audiências agendadas",
    scheduled: "Compromissos ativos",
  };
  const metricItems: Record<AgendaMetric, CalendarItem[]> = {
    today: itemsByDay.get(today) ?? [],
    deadlines: overview.process_deadlines.map((process) => ({
      kind: "deadline", dateKey: process.due_date.slice(0, 10), process,
    })),
    hearings: activeEvents
      .filter((event) => event.event_type === "Audiência")
      .map((event) => ({ kind: "event", dateKey: localDateKey(new Date(event.starts_at)), event })),
    scheduled: activeEvents
      .map((event) => ({ kind: "event", dateKey: localDateKey(new Date(event.starts_at)), event })),
  };
  const todayDate = dateFromKey(today);
  const upcomingDeadlines = processes
    .filter((process) => process.status !== "Concluído" && process.due_date)
    .map((process) => ({
      process,
      days: Math.round((dateFromKey(process.due_date!.slice(0, 10)).getTime() - todayDate.getTime()) / 86_400_000),
    }))
    .filter(({ days }) => days >= 0 && days <= 7)
    .sort((first, second) => first.days - second.days);

  async function saveEvent(draft: EventDraft) {
    setSaving(true);
    setModalError("");
    try {
      const startsAt = new Date(`${draft.date}T${draft.time}:00`);
      const endsAt = draft.end_time ? new Date(`${draft.date}T${draft.end_time}:00`) : null;
      if (endsAt && endsAt < startsAt) throw new Error("O horário final não pode ser anterior ao inicial.");
      const body = {
        title: draft.title.trim(),
        event_type: draft.event_type,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() ?? null,
        process_id: draft.process_id || null,
        location: draft.location.trim(),
        notes: draft.notes.trim(),
      };
      const availabilityParams = new URLSearchParams({ start: draft.date, end: draft.date });
      await apiRequest<AgendaOverview>(`/api/v1/agenda?${availabilityParams}`, {
        method: "GET", accessToken, workspaceId,
      });
      await apiRequest<AgendaEvent>(editing
        ? `/api/v1/agenda/${editing.id}`
        : "/api/v1/agenda", {
        method: editing ? "PATCH" : "POST",
        accessToken,
        workspaceId,
        body: JSON.stringify(body),
      });
      setSelectedDate(draft.date);
      setEditing(undefined);
      await loadAgenda();
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Não foi possível salvar o compromisso.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(event: AgendaEvent, status: AgendaEventStatus) {
    try {
      await apiRequest<AgendaEvent>(`/api/v1/agenda/${event.id}`, {
        method: "PATCH", accessToken, workspaceId, body: JSON.stringify({ status }),
      });
      await loadAgenda();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o compromisso.");
    }
  }

  async function deleteEvent(event: AgendaEvent) {
    if (!window.confirm(`Excluir “${event.title}” da agenda?`)) return;
    try {
      await apiRequest<void>(`/api/v1/agenda/${event.id}`, { method: "DELETE", accessToken, workspaceId });
      await loadAgenda();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir o compromisso.");
    }
  }

  function moveMonth(offset: number) {
    const target = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    setMonth(target);
    setSelectedDate(localDateKey(target));
  }

  function focusCalendarDate(dateKey: string) {
    const target = dateFromKey(dateKey);
    setMonth(new Date(target.getFullYear(), target.getMonth(), 1, 12));
    setSelectedDate(dateKey);
    setActiveMetric(null);
  }

  function openProcess(id: string) {
    const process = processes.find((item) => item.id === id);
    if (process) onOpenProcess(process);
  }

  return (
    <>
      <section className="page-head agenda-heading">
        <div><p className="eyebrow">AGENDA COMPARTILHADA</p><h2>{workspaceName}</h2><p>Audiências, compromissos e prazos dos processos no mesmo calendário.</p></div>
        <button className="primary-btn" onClick={() => { setModalError(""); setEditing(null); }}>＋ Novo compromisso</button>
      </section>
      {error && <div className="error-banner agenda-load-error" role="alert"><span>{error}</span><button className="ghost-btn" onClick={() => void loadAgenda()}>↻ Tentar novamente</button></div>}
      {processesError && !error && <div className="agenda-process-warning" role="status"><span>A agenda está disponível, mas a lista para vincular processos não carregou.</span><button className="link-button" onClick={() => void loadProcesses()}>Carregar processos novamente</button></div>}
      {metrics.today > 0 && <div className="agenda-today-alert" role="status">Hoje há <strong>{metrics.today} item(ns)</strong> na agenda do escritório.</div>}
      <section className="metrics-grid agenda-metrics">
        <button className="metric agenda-metric-button blue" onClick={() => setActiveMetric("today")}><span>HOJE</span><strong>{metrics.today}</strong><small>Item(ns) para hoje</small><em>Ver itens →</em></button>
        <button className="metric agenda-metric-button orange" onClick={() => setActiveMetric("deadlines")}><span>PRAZOS</span><strong>{metrics.deadlines}</strong><small>No período exibido</small><em>Ver prazos →</em></button>
        <button className="metric agenda-metric-button red" onClick={() => setActiveMetric("hearings")}><span>AUDIÊNCIAS</span><strong>{metrics.hearings}</strong><small>Agendadas no período</small><em>Ver audiências →</em></button>
        <button className="metric agenda-metric-button green" onClick={() => setActiveMetric("scheduled")}><span>COMPROMISSOS</span><strong>{metrics.scheduled}</strong><small>Eventos ativos no período</small><em>Ver compromissos →</em></button>
      </section>
      <section className={`panel upcoming-deadlines-panel ${upcomingDeadlines.length > 0 ? "has-deadlines" : "clear"}`}>
        <header className="panel-head">
          <div><p className="eyebrow">PRIORIDADE DA SEMANA</p><h3>Próximos prazos — 7 dias</h3><span>Os prazos cadastrados nos processos entram aqui automaticamente.</span></div>
          <strong>{upcomingDeadlines.length}</strong>
        </header>
        {upcomingDeadlines.length === 0 ? <div className="upcoming-deadline-empty">✓ Nenhum processo vence nos próximos 7 dias.</div> : <div className="upcoming-deadline-grid">
          {upcomingDeadlines.map(({ process, days }) => <button key={process.id} onClick={() => onOpenProcess(process)}>
            <span className={days === 0 ? "today" : "upcoming"}>{days === 0 ? "VENCE HOJE" : days === 1 ? "VENCE AMANHÃ" : `VENCE EM ${days} DIAS`}</span>
            <strong>{process.client}</strong>
            <small>{dateFromKey(process.due_date!.slice(0, 10)).toLocaleDateString("pt-BR")} · {process.number || "Sem número"}{process.next_action ? ` · ${process.next_action}` : ""}</small>
            <i>ABRIR PROCESSO →</i>
          </button>)}
        </div>}
      </section>
      {overview.overdue_deadlines.length > 0 && <section className="panel overdue-deadlines-panel">
        <header className="panel-head"><div><p className="eyebrow">ATENÇÃO NECESSÁRIA</p><h3>Prazos vencidos dos processos</h3></div><strong>{overview.overdue_deadlines.length}</strong></header>
        <div className="overdue-deadline-grid">
          {overview.overdue_deadlines.map((process) => {
            const overdueDays = Math.max(1, Math.floor((dateFromKey(today).getTime() - dateFromKey(process.due_date.slice(0, 10)).getTime()) / 86_400_000));
            return <button key={process.id} onClick={() => openProcess(process.id)}>
              <span>{overdueDays} dia(s) em atraso</span>
              <strong>{process.client}</strong>
              <small>{process.number || "Sem número"}{process.next_action ? ` · ${process.next_action}` : ""}</small>
            </button>;
          })}
        </div>
      </section>}
      <div className="agenda-layout">
        <section className="panel calendar-panel" aria-label="Calendário mensal">
          <header className="calendar-toolbar">
            <button className="ghost-btn" onClick={() => moveMonth(-1)} aria-label="Mês anterior">‹</button>
            <div><h3>{MONTH_FORMAT.format(month)}</h3><button onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelectedDate(today); }}>Ir para hoje</button></div>
            <button className="ghost-btn" onClick={() => moveMonth(1)} aria-label="Próximo mês">›</button>
          </header>
          <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className={`calendar-grid ${loading ? "is-loading" : ""}`}>
            {days.map((day) => {
              const key = localDateKey(day);
              const dayItems = itemsByDay.get(key) ?? [];
              const outside = day.getMonth() !== month.getMonth();
              return <button key={key} className={`${outside ? "outside" : ""} ${key === selectedDate ? "selected" : ""} ${key === today ? "today" : ""}`} onClick={() => setSelectedDate(key)}>
                <span>{day.getDate()}</span>
                <div className="calendar-dots">
                  {dayItems.slice(0, 3).map((item, index) => <i key={`${item.kind}-${index}`} className={item.kind === "deadline" ? "deadline-dot" : `event-dot ${item.event.status}`} />)}
                  {dayItems.length > 3 && <b>+{dayItems.length - 3}</b>}
                </div>
              </button>;
            })}
          </div>
        </section>
        <section className="panel day-agenda">
          <header className="panel-head"><div><p className="eyebrow">DIA SELECIONADO</p><h3>{selectedLabel}</h3></div><button className="ghost-btn" onClick={() => { setModalError(""); setEditing(null); }}>＋ Adicionar</button></header>
          <div className="day-agenda-list">
            {loading ? <div className="agenda-empty">Carregando agenda…</div> : selectedItems.length === 0 ? <div className="agenda-empty"><strong>Dia livre</strong><span>Nenhum prazo ou compromisso nesta data.</span></div> : selectedItems.map((item) => item.kind === "deadline" ? (
              <article className="agenda-card process-deadline-card" key={`deadline-${item.process.id}`}>
                <div className="agenda-card-time">PRAZO</div>
                <div className="agenda-card-copy"><span>PROCESSO · {item.process.priority}</span><strong>{item.process.client}</strong><p>{item.process.number || "Sem número"}{item.process.next_action ? ` · ${item.process.next_action}` : ""}</p></div>
                <button className="link-button" onClick={() => openProcess(item.process.id)}>Abrir processo</button>
              </article>
            ) : (
              <article className={`agenda-card event-card status-${item.event.status}`} key={item.event.id}>
                <div className="agenda-card-time">{TIME_FORMAT.format(new Date(item.event.starts_at))}</div>
                <div className="agenda-card-copy"><span>{item.event.event_type} · {item.event.status}</span><strong>{item.event.title}</strong>{item.event.process && <p>{item.event.process.client}{item.event.process.number ? ` · ${item.event.process.number}` : ""}</p>}{item.event.location && <p>⌖ {item.event.location}</p>}</div>
                <div className="agenda-card-actions"><button onClick={() => { setModalError(""); setEditing(item.event); }}>Editar</button>{item.event.status === "agendado" ? <><button onClick={() => void setStatus(item.event, "concluído")}>Concluir</button><button onClick={() => void setStatus(item.event, "cancelado")}>Cancelar</button></> : <button onClick={() => void setStatus(item.event, "agendado")}>Reabrir</button>}<button className="danger-link" onClick={() => void deleteEvent(item.event)}>Excluir</button></div>
              </article>
            ))}
          </div>
          <footer className="agenda-legend"><span><i className="deadline-dot" /> Prazo de processo</span><span><i className="event-dot agendado" /> Compromisso</span></footer>
        </section>
      </div>
      {activeMetric && <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setActiveMetric(null)}><section className="modal-card agenda-metric-modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">RESUMO DA AGENDA</p><h2>{metricTitles[activeMetric]}</h2><span>{metricItems[activeMetric].length} item(ns) encontrado(s)</span></div><button className="icon-button" onClick={() => setActiveMetric(null)} aria-label="Fechar">×</button></header><div className="agenda-metric-list">
        {metricItems[activeMetric].length === 0 ? <div className="agenda-empty"><strong>Nenhum item encontrado.</strong><span>Não há registros deste tipo no período exibido.</span></div> : metricItems[activeMetric].map((item) => item.kind === "deadline" ? <button key={`metric-deadline-${item.process.id}`} onClick={() => { setActiveMetric(null); openProcess(item.process.id); }}><div><span>PRAZO · {dateFromKey(item.dateKey).toLocaleDateString("pt-BR")}</span><strong>{item.process.client}</strong><small>{item.process.number || "Sem número"}{item.process.next_action ? ` · ${item.process.next_action}` : ""}</small></div><i>Abrir processo →</i></button> : <button key={`metric-event-${item.event.id}`} onClick={() => focusCalendarDate(item.dateKey)}><div><span>{item.event.event_type} · {dateFromKey(item.dateKey).toLocaleDateString("pt-BR")}</span><strong>{item.event.title}</strong><small>{TIME_FORMAT.format(new Date(item.event.starts_at))}{item.event.process ? ` · ${item.event.process.client}` : ""}</small></div><i>Ver no calendário →</i></button>)}
      </div></section></div>}
      {editing !== undefined && <EventModal key={editing?.id ?? `new-${selectedDate}`} event={editing} date={selectedDate} processes={processes} processesLoading={processesLoading} processesError={processesError} busy={saving} error={modalError} onClose={() => setEditing(undefined)} onSave={saveEvent} onReloadProcesses={loadProcesses} />}
    </>
  );
}
