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
  busy,
  error,
  onClose,
  onSave,
}: {
  event: AgendaEvent | null;
  date: string;
  processes: ProcessRecord[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (draft: EventDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => draftFor(date, event ?? undefined));

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
            <label>Processo (opcional)<select value={draft.process_id} onChange={(inputEvent) => setDraft({ ...draft, process_id: inputEvent.target.value })}><option value="">Sem processo vinculado</option>{processes.map((process) => <option key={process.id} value={process.id}>{process.client} {process.number ? `· ${process.number}` : ""}</option>)}</select></label>
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
  const [overview, setOverview] = useState<AgendaOverview>({ events: [], process_deadlines: [] });
  const [processes, setProcesses] = useState<ProcessRecord[]>([]);
  const [editing, setEditing] = useState<AgendaEvent | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");

  const calendarStart = useMemo(() => startOfCalendar(month), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index)), [calendarStart]);
  const calendarEnd = days[days.length - 1];
  const calendarStartKey = localDateKey(calendarStart);
  const calendarEndKey = localDateKey(calendarEnd);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start: localDateKey(calendarStart), end: localDateKey(calendarEnd) });
      const [agenda, processList] = await Promise.all([
        apiRequest<AgendaOverview>(`/api/v1/agenda?${params}`, { method: "GET", accessToken, workspaceId }),
        apiRequest<ProcessList>("/api/v1/processes?limit=200", { method: "GET", accessToken, workspaceId }),
      ]);
      setOverview(agenda);
      setProcesses(processList.items);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a agenda.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, calendarEnd, calendarStart, workspaceId]);

  useEffect(() => { void load(); }, [load]);

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
      await load();
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
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o compromisso.");
    }
  }

  async function deleteEvent(event: AgendaEvent) {
    if (!window.confirm(`Excluir “${event.title}” da agenda?`)) return;
    try {
      await apiRequest<void>(`/api/v1/agenda/${event.id}`, { method: "DELETE", accessToken, workspaceId });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir o compromisso.");
    }
  }

  function moveMonth(offset: number) {
    const target = new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
    setMonth(target);
    setSelectedDate(localDateKey(target));
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
      {error && <div className="error-banner" role="alert">{error}</div>}
      {metrics.today > 0 && <div className="agenda-today-alert" role="status">Hoje há <strong>{metrics.today} item(ns)</strong> na agenda do escritório.</div>}
      <section className="metrics-grid agenda-metrics">
        <div className="metric blue"><span>HOJE</span><strong>{metrics.today}</strong><small>Item(ns) para hoje</small></div>
        <div className="metric orange"><span>PRAZOS</span><strong>{metrics.deadlines}</strong><small>No período exibido</small></div>
        <div className="metric red"><span>AUDIÊNCIAS</span><strong>{metrics.hearings}</strong><small>Agendadas no período</small></div>
        <div className="metric green"><span>COMPROMISSOS</span><strong>{metrics.scheduled}</strong><small>Eventos ativos no período</small></div>
      </section>
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
      {editing !== undefined && <EventModal key={editing?.id ?? `new-${selectedDate}`} event={editing} date={selectedDate} processes={processes} busy={saving} error={modalError} onClose={() => setEditing(undefined)} onSave={saveEvent} />}
    </>
  );
}
