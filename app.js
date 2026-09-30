let processes = [];
let financeEntries = [];
let currentFilter = "Todos";
let editingId = null;
let detailId = null;
let financeEditingId = null;
let financeDetailId = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  setToday();
  await load();
});

async function load() {
  try {
    processes = await window.api.loadProcesses();
    financeEntries = await window.api.loadFinance();
    if (!Array.isArray(processes)) processes = [];
    if (!Array.isArray(financeEntries)) financeEntries = [];
    refreshAll();
  } catch (e) {
    toast("Não foi possível carregar os dados.", true);
  }
}

async function persistProcesses() {
  await window.api.saveProcesses(processes);
}

async function persistFinance() {
  await window.api.saveFinance(financeEntries);
}

function bindEvents() {
  document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  document.querySelectorAll("[data-page-target]").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.pageTarget));
  });

  $("refreshBtn").addEventListener("click", async () => {
    await load();
    toast("Dados atualizados.");
  });

  $("newProcessBtn").addEventListener("click", () => openForm());
  $("newProcessBtn2").addEventListener("click", () => openForm());
  $("closeProcessModal").addEventListener("click", closeForm);
  $("cancelProcess").addEventListener("click", closeForm);
  $("processForm").addEventListener("submit", saveForm);

  $("searchInput").addEventListener("input", renderProcesses);

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      currentFilter = chip.dataset.filter;
      updateFilterButtons();
      renderProcesses();
    });
  });

  $("seeAttentionBtn").addEventListener("click", () => showPage("atencao"));

  $("importTrelloBtn").addEventListener("click", importTrello);
  $("backupBtn").addEventListener("click", backup);

  $("closeDetailModal").addEventListener("click", closeDetail);
  $("detailEdit").addEventListener("click", () => {
    const p = getProcess(detailId);
    closeDetail();
    if (p) openForm(p);
  });
  $("detailDelete").addEventListener("click", deleteDetail);
  $("detailToggle").addEventListener("click", toggleDetailStatus);

  $("newFinanceBtn").addEventListener("click", () => openFinanceForm());
  $("closeFinanceModal").addEventListener("click", closeFinanceForm);
  $("cancelFinance").addEventListener("click", closeFinanceForm);
  $("financeForm").addEventListener("submit", saveFinanceForm);
  $("finParcelado").addEventListener("change", toggleInstallmentFields);
  ["finQtdParcelas","finPeriodicidade","finPrimeiraParcela","finPrimeiraRecebida","finValor"].forEach(id => {
    $(id).addEventListener("input", renderParcelPreview);
    $(id).addEventListener("change", renderParcelPreview);
  });
  $("financeMonth").addEventListener("change", renderFinance);
  $("financeYear").addEventListener("change", renderFinance);
  $("financeCurrentBtn").addEventListener("click", () => {
    const now = new Date();
    $("financeMonth").value = String(now.getMonth() + 1);
    $("financeYear").value = String(now.getFullYear());
    renderFinance();
  });
  $("closeFinanceDetail").addEventListener("click", closeFinanceDetail);
  $("financeDelete").addEventListener("click", deleteFinanceDetail);
  $("financeEdit").addEventListener("click", () => {
    const entry = financeEntries.find(x => x.id === financeDetailId);
    closeFinanceDetail();
    if (entry) openFinanceForm(entry);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeForm(); closeDetail(); closeFinanceForm(); closeFinanceDetail();
    }
  });
}

function showPage(page) {
  const pages = {
    dashboard: ["dashboardPage", "Visão geral", "PAINEL"],
    processos: ["processosPage", "Processos", "GESTÃO"],
    atencao: ["atencaoPage", "Atenção", "PENDÊNCIAS"],
    financeiro: ["financeiroPage", "Financeiro", "FINANCEIRO"]
  };

  Object.values(pages).forEach(([id]) => $(id).classList.add("hidden"));
  if (!pages[page]) page = "dashboard";
  const [id, title, eyebrow] = pages[page];
  $(id).classList.remove("hidden");
  $("pageTitle").textContent = title;
  $("pageEyebrow").textContent = eyebrow;

  document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  // O botão de "Novo processo" pertence apenas ao contexto de processos.
  // No Financeiro ele fica oculto para não misturar as funções.
  const showNewProcess = page === "dashboard" || page === "processos";
  $("newProcessBtn").classList.toggle("hidden", !showNewProcess);

  if (page === "processos") renderProcesses();
  if (page === "atencao") renderAttentionFull();
  if (page === "financeiro") renderFinance();
}

function setToday() {
  $("todayLabel").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }).format(new Date());
}

function refreshAll() {
  renderMetrics();
  renderDashboard();
  renderProcesses();
  renderAttentionFull();
  setupFinanceYears();
  renderFinance();
}

function getProcess(id) {
  return processes.find(p => String(p.id) === String(id));
}

function nextId(items) {
  return items.reduce((max, x) => Math.max(max, Number(x.id) || 0), 0) + 1;
}

function formatDate(value) {
  if (!value) return "Sem prazo";
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "Sem prazo";
  return d.toLocaleDateString("pt-BR");
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function dateKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function deadlineState(p) {
  if (!p.data_prazo) return "muted";
  if (p.status === "Concluído") return "green";
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(`${String(p.data_prazo).slice(0,10)}T00:00:00`);
  const diff = Math.ceil((due - today) / 86400000);
  if (diff < 0) return "red";
  if (diff === 0) return "orange";
  if (diff <= 3) return "yellow";
  if (diff <= 7) return "blue";
  return "green";
}

function daysText(p) {
  if (!p.data_prazo) return "Sem prazo";
  if (p.status === "Concluído") return "Concluído";
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(`${String(p.data_prazo).slice(0,10)}T00:00:00`);
  const diff = Math.ceil((due - today) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} dia(s) atrasado`;
  if (diff === 0) return "Vence hoje";
  if (diff === 1) return "Vence amanhã";
  return `Faltam ${diff} dias`;
}

function badgeStyle(state) {
  return state === "red" ? "red" : state === "orange" ? "orange" : state === "yellow" ? "yellow" : state === "blue" ? "blue" : state === "green" ? "green" : "muted";
}

function renderMetrics() {
  const total = processes.length;
  const andamento = processes.filter(p => p.status === "Em andamento").length;
  const concluido = processes.filter(p => p.status === "Concluído").length;
  const attention = processes.filter(p => ["red","orange","yellow"].includes(deadlineState(p)) && p.status !== "Concluído").length;

  $("metrics").innerHTML = `
    <div class="metric blue"><div class="label">TOTAL DE PROCESSOS</div><div class="value">${total}</div><div class="sub">Base cadastrada</div></div>
    <div class="metric orange"><div class="label">EM ANDAMENTO</div><div class="value">${andamento}</div><div class="sub">Processos ativos</div></div>
    <div class="metric red"><div class="label">ATENÇÃO</div><div class="value">${attention}</div><div class="sub">Prazos próximos ou vencidos</div></div>
    <div class="metric green"><div class="label">CONCLUÍDOS</div><div class="value">${concluido}</div><div class="sub">Finalizados</div></div>
  `;
  $("sideAttention").textContent = attention;
}

function renderDashboard() {
  const attention = processes
    .filter(p => p.status !== "Concluído" && ["red","orange","yellow"].includes(deadlineState(p)))
    .sort((a,b) => deadlineRank(a)-deadlineRank(b))
    .slice(0, 6);

  $("attentionList").innerHTML = attention.length ? attention.map(p => attentionHtml(p)).join("") : `<div class="empty">Nenhum prazo crítico no momento.</div>`;

  const total = processes.length;
  const counts = [
    ["Em andamento", processes.filter(p => p.status === "Em andamento").length, "#3b82f6"],
    ["Atenção", processes.filter(p => p.status === "Atenção").length, "#f59e0b"],
    ["Concluído", processes.filter(p => p.status === "Concluído").length, "#36d399"],
    ["Sobrestado", processes.filter(p => p.status === "Sobrestado").length, "#7c8795"]
  ];
  $("donutTotal").textContent = total;
  let cursor = 0;
  const parts = counts.map(([,n,color]) => {
    const start = cursor; cursor += total ? n/total*100 : 0;
    return `${color} ${start}% ${cursor}%`;
  });
  $("donut").style.background = total ? `conic-gradient(${parts.join(",")})` : "#26303a";
  $("legend").innerHTML = counts.map(([name,n,color]) => `<div class="legend-item"><i class="legend-dot" style="background:${color}"></i>${esc(name)} <b>${n}</b></div>`).join("");

  const recent = [...processes].sort((a,b) => String(b.criado_em || "").localeCompare(String(a.criado_em || ""))).slice(0,8);
  $("recentTable").innerHTML = recent.length ? recent.map(rowHtml).join("") : `<tr><td colspan="4"><div class="empty">Nenhum processo cadastrado.</div></td></tr>`;
}

function attentionHtml(p) {
  const state = deadlineState(p);
  const color = state === "red" ? "#ff6573" : state === "orange" ? "#ffae48" : "#e9d16a";
  return `<div class="attention-item" onclick="openDetail(${JSON.stringify(p.id)})">
    <span class="dot" style="background:${color}"></span>
    <div class="attention-main"><strong>${esc(p.cliente || "Sem identificação")}</strong><span>${esc(p.numero || "Sem número")} · ${esc(p.proxima_acao || "Acompanhar")}</span></div>
    <div class="item-deadline deadline-${badgeStyle(state)}"><span>📅 ${formatDate(p.data_prazo)}</span><strong>${daysText(p)}</strong></div>
  </div>`;
}

function deadlineRank(p) {
  if (!p.data_prazo) return 999999;
  const d = new Date(`${String(p.data_prazo).slice(0,10)}T00:00:00`);
  return d.getTime();
}

function renderProcesses() {
  const query = ($("searchInput").value || "").toLowerCase().trim();
  let list = [...processes];

  if (currentFilter === "Atrasados") list = list.filter(p => deadlineState(p) === "red" && p.status !== "Concluído");
  else if (currentFilter === "Urgentes") list = list.filter(p => p.prioridade === "Urgente");
  else if (currentFilter === "Atenção") list = list.filter(p => ["red","orange","yellow"].includes(deadlineState(p)) && p.status !== "Concluído");
  else if (currentFilter !== "Todos") list = list.filter(p => p.status === currentFilter);

  if (query) {
    list = list.filter(p => [p.cliente,p.numero,p.tipo,p.proxima_acao,p.observacoes].join(" ").toLowerCase().includes(query));
  }

  list.sort((a,b) => deadlineRank(a)-deadlineRank(b));
  $("processTable").innerHTML = list.length ? list.map(p => `
    <tr>
      <td><strong>${esc(p.cliente || "Sem identificação")}</strong><br><span>${esc(p.numero || "Sem número")} · ${esc(p.tipo || "Processo")}</span></td>
      <td><div class="item-deadline deadline-${badgeStyle(deadlineState(p))}"><span>${formatDate(p.data_prazo)}</span><strong>${daysText(p)}</strong></div></td>
      <td>${esc(p.proxima_acao || "Acompanhar")}</td>
      <td><span class="priority priority-${String(p.prioridade || "Normal").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")}">${esc(p.prioridade || "Normal")}</span></td>
      <td><span class="status status-${String(p.status || "").toLowerCase().replaceAll(" ","-").normalize("NFD").replace(/[\u0300-\u036f]/g,"")}">${esc(p.status || "Em andamento")}</span></td>
      <td><button onclick="openDetail(${JSON.stringify(p.id)})">Abrir</button></td>
    </tr>
  `).join("") : `<tr><td colspan="6"><div class="empty">Nenhum processo encontrado.</div></td></tr>`;
}

function updateFilterButtons() {
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.filter === currentFilter));
}

function openForm(process = null) {
  editingId = process ? process.id : null;
  $("formTitle").textContent = process ? "Editar processo" : "Novo processo";
  $("fCliente").value = process?.cliente || "";
  $("fNumero").value = process?.numero || "";
  $("fTipo").value = process?.tipo || "";
  $("fPrazo").value = process?.data_prazo || "";
  $("fAcao").value = process?.proxima_acao || "";
  $("fPrioridade").value = process?.prioridade || "Normal";
  $("fStatus").value = process?.status || "Em andamento";
  $("fObs").value = process?.observacoes || "";
  $("processModal").classList.remove("hidden");
  setTimeout(() => $("fCliente").focus(), 50);
}

function closeForm() {
  $("processModal").classList.add("hidden");
  editingId = null;
}

async function saveForm(e) {
  e.preventDefault();
  const data = {
    cliente: $("fCliente").value.trim(),
    numero: $("fNumero").value.trim(),
    tipo: $("fTipo").value.trim(),
    data_prazo: $("fPrazo").value,
    proxima_acao: $("fAcao").value.trim(),
    prioridade: $("fPrioridade").value,
    status: $("fStatus").value,
    observacoes: $("fObs").value.trim()
  };

  if (!data.cliente) return toast("Informe o cliente ou parte.", true);

  if (editingId) {
    const p = getProcess(editingId);
    Object.assign(p, data, { atualizado_em: new Date().toISOString() });
  } else {
    processes.push({ id: nextId(processes), ...data, criado_em: new Date().toISOString() });
  }

  const wasEditing = Boolean(editingId);
  await persistProcesses();
  closeForm();
  refreshAll();
  if (wasEditing) showPage("processos");
  toast("Processo salvo.");
}

function openDetail(id) {
  detailId = id;
  const p = getProcess(id);
  if (!p) return;
  $("detailTitle").textContent = p.cliente || "Processo";
  $("detailContent").innerHTML = `<div class="detail-block">
    <div class="detail-grid">
      ${detailField("Número", p.numero)}
      ${detailField("Tipo", p.tipo)}
      ${detailField("Prazo", `${formatDate(p.data_prazo)} — ${daysText(p)}`)}
      ${detailField("Próxima ação", p.proxima_acao)}
      ${detailField("Prioridade", p.prioridade)}
      ${detailField("Status", p.status)}
    </div>
    ${p.observacoes ? `<div class="detail-note">${esc(p.observacoes)}</div>` : ""}
  </div>`;
  $("detailToggle").textContent = p.status === "Concluído" ? "Reabrir" : "Concluir";
  $("detailModal").classList.remove("hidden");
}

function detailField(label,value) {
  return `<div class="detail-field"><span>${esc(label)}</span><strong>${esc(value || "—")}</strong></div>`;
}

function closeDetail() {
  $("detailModal").classList.add("hidden");
  detailId = null;
}

async function toggleDetailStatus() {
  const p = getProcess(detailId);
  if (!p) return;
  p.status = p.status === "Concluído" ? "Em andamento" : "Concluído";
  await persistProcesses();
  closeDetail();
  refreshAll();
  toast(p.status === "Concluído" ? "Processo concluído." : "Processo reaberto.");
}

async function deleteDetail() {
  const p = getProcess(detailId);
  if (!p) return;
  if (!confirm(`Excluir o processo "${p.cliente}"?`)) return;
  processes = processes.filter(x => String(x.id) !== String(detailId));
  await persistProcesses();
  closeDetail();
  refreshAll();
  toast("Processo excluído.");
}

function renderAttentionFull() {
  const list = processes.filter(p => p.status !== "Concluído" && ["red","orange","yellow"].includes(deadlineState(p))).sort((a,b)=>deadlineRank(a)-deadlineRank(b));
  $("attentionFull").innerHTML = list.length ? list.map(p => `<div class="panel">${attentionHtml(p)}</div>`).join("") : `<section class="panel"><div class="empty">Nenhuma pendência crítica.</div></section>`;
}

async function importTrello() {
  const result = await window.api.importTrello();
  if (result.canceled) return;
  if (result.error) return toast(`Erro ao importar: ${result.error}`, true);
  if (!Array.isArray(result.data)) return toast("Exportação inválida.", true);
  if (!result.data.length) return toast("Nenhum cartão encontrado.", true);

  processes.push(...result.data);
  await persistProcesses();
  refreshAll();
  toast(`${result.data.length} processo(s) importado(s) do Trello.`);
}

async function backup() {
  const result = await window.api.createBackup();
  if (result?.canceled) return;
  toast(`Backup salvo em ${result.path}`);
}

function setupFinanceYears() {
  const current = new Date().getFullYear();
  const years = new Set([current]);
  financeEntries.forEach(e => {
    const d = new Date(`${String(e.data || "").slice(0,10)}T12:00:00`);
    if (!Number.isNaN(d.getTime())) years.add(d.getFullYear());
    (e.parcelas || []).forEach(p => {
      const pd = new Date(`${String(p.dataVencimento || "").slice(0,10)}T12:00:00`);
      if (!Number.isNaN(pd.getTime())) years.add(pd.getFullYear());
    });
  });
  const selected = $("financeYear").value;
  $("financeYear").innerHTML = [...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join("");
  $("financeYear").value = years.has(Number(selected)) ? selected : String(current);
  if (!$("financeMonth").value) $("financeMonth").value = String(new Date().getMonth()+1);
}

function expandMovements() {
  const movements = [];
  financeEntries.forEach(e => {
    if (e.parcelado && Array.isArray(e.parcelas)) {
      e.parcelas.forEach(p => {
        if (p.status === "recebida" && e.tipo === "receita") {
          movements.push({ id:`${e.id}-${p.numero}`, data:p.dataRecebimento || p.dataVencimento, descricao:`${e.descricao} — parcela ${p.numero}/${e.parcelas.length}`, categoria:e.categoria, tipo:"receita", valor:p.valor, sourceId:e.id });
        }
      });
    } else {
      movements.push({ id:e.id, data:e.data, descricao:e.descricao, categoria:e.categoria, tipo:e.tipo, valor:Number(e.valor)||0, sourceId:e.id });
    }
  });
  return movements;
}

function allReceivableInstallments() {
  const out = [];
  financeEntries.forEach(e => {
    if (e.parcelado && e.tipo === "receita") {
      (e.parcelas || []).forEach(p => out.push({...p, sourceId:e.id, descricao:e.descricao, categoria:e.categoria, cliente:e.cliente || ""}));
    }
  });
  return out;
}

function renderFinance() {
  setupFinanceYears();
  const month = $("financeMonth").value;
  const year = Number($("financeYear").value) || new Date().getFullYear();

  const movements = expandMovements();
  const filtered = movements.filter(m => {
    const d = new Date(`${String(m.data).slice(0,10)}T12:00:00`);
    if (Number.isNaN(d.getTime()) || d.getFullYear() !== year) return false;
    return month === "all" || d.getMonth()+1 === Number(month);
  });

  const receitas = filtered.filter(x=>x.tipo==="receita").reduce((s,x)=>s+x.valor,0);
  const despesas = filtered.filter(x=>x.tipo==="despesa").reduce((s,x)=>s+x.valor,0);
  const saldo = receitas-despesas;

  const yearMovements = movements.filter(m => new Date(`${String(m.data).slice(0,10)}T12:00:00`).getFullYear() === year);
  const yearReceitas = yearMovements.filter(x=>x.tipo==="receita").reduce((s,x)=>s+x.valor,0);
  const yearDespesas = yearMovements.filter(x=>x.tipo==="despesa").reduce((s,x)=>s+x.valor,0);
  const receivable = allReceivableInstallments();
  const pending = receivable.filter(p=>p.status!=="recebida").reduce((s,p)=>s+(Number(p.valor)||0),0);
  const overdue = receivable.filter(p=>p.status!=="recebida" && p.dataVencimento < dateKey(new Date())).length;

  $("financeMetrics").innerHTML = `
    <div class="metric blue"><div class="label">RECEITAS NO MÊS</div><div class="value">${money(receitas)}</div><div class="sub">${month === "all" ? "Todos os meses de " + year : "Recebimentos efetivados no mês"}</div></div>
    <div class="metric red"><div class="label">DESPESAS NO MÊS</div><div class="value">${money(despesas)}</div><div class="sub">Saídas registradas no período</div></div>
    <div class="metric ${saldo>=0?"green":"red"}"><div class="label">SALDO NO MÊS</div><div class="value">${money(saldo)}</div><div class="sub">Receitas menos despesas</div></div>
    <div class="metric orange"><div class="label">A RECEBER</div><div class="value">${money(pending)}</div><div class="sub">${overdue} parcela(s) atrasada(s)</div></div>
  `;

  const monthName = $("financeMonth").selectedOptions?.[0]?.text || "Período";
  const yearLabel = String(year);
  $("summaryPeriod").textContent = month === "all" ? `Ano ${yearLabel}` : `${monthName} de ${yearLabel}`;

  const pendingInYear = receivable
    .filter(p => p.status !== "recebida" && String(p.dataVencimento || "").slice(0,4) === String(year))
    .reduce((s,p)=>s+(Number(p.valor)||0),0);

  $("financeSummaryGrid").innerHTML = `
    <div class="summary-card month">
      <div class="summary-label">NO MÊS SELECIONADO</div>
      <div class="summary-value">${money(receitas)}</div>
      <div class="summary-note">Total efetivamente recebido</div>
    </div>
    <div class="summary-card year">
      <div class="summary-label">NO ANO DE ${yearLabel}</div>
      <div class="summary-value">${money(yearReceitas)}</div>
      <div class="summary-note">Total efetivamente recebido no ano</div>
    </div>
    <div class="summary-card saldo">
      <div class="summary-label">SALDO DO ANO</div>
      <div class="summary-value">${money(yearReceitas - yearDespesas)}</div>
      <div class="summary-note">Receitas anuais − despesas anuais</div>
    </div>
    <div class="summary-card pending">
      <div class="summary-label">A RECEBER EM ${yearLabel}</div>
      <div class="summary-value">${money(pendingInYear)}</div>
      <div class="summary-note">Parcelas ainda pendentes com vencimento no ano</div>
    </div>
  `;

  $("sideFinanceAlert").textContent = overdue;

  const today = dateKey(new Date());
  const upcoming = receivable.filter(p=>p.status!=="recebida" && p.dataVencimento >= today).sort((a,b)=>a.dataVencimento.localeCompare(b.dataVencimento)).slice(0,7);
  const late = receivable.filter(p=>p.status!=="recebida" && p.dataVencimento < today).sort((a,b)=>a.dataVencimento.localeCompare(b.dataVencimento)).slice(0,7);

  const overdueTotal = late.reduce((s,p)=>s+(Number(p.valor)||0),0);
  $("upcomingInstallments").innerHTML = upcoming.length ? upcoming.map(p=>installmentHtml(p,"upcoming")).join("") : `<div class="empty">Nenhuma parcela futura.</div>`;
  $("overdueInstallments").innerHTML = late.length ? late.map(p=>installmentHtml(p,"overdue")).join("") : `<div class="empty">Nenhuma parcela atrasada.</div>`;
  $("overdueCounter").textContent = late.length ? `${late.length} atrasada(s) · ${money(overdueTotal)}` : "0 atrasadas";

  renderFinanceChart(year, yearMovements);
  renderCategories(filtered);
  renderFinanceTable(filtered);
}

function installmentHtml(p, type) {
  const days = Math.ceil((new Date(`${p.dataVencimento}T00:00:00`) - new Date(`${dateKey(new Date())}T00:00:00`))/86400000);
  let text = type === "overdue" ? `ATRASADA HÁ ${Math.abs(days)} DIA(S)` : days === 0 ? "VENCE HOJE" : days === 1 ? "VENCE AMANHÃ" : `VENCE EM ${days} DIAS`;
  return `<div class="installment ${type==="overdue"?"inst-overdue":"inst-upcoming"}">
    <div class="inst-icon">${p.numero}</div>
    <div class="inst-main"><strong>${esc(p.descricao)}</strong><span>${esc(p.cliente || "Recebimento")} · Parcela ${p.numero}/${p.totalParcelas} · ${formatDate(p.dataVencimento)}</span></div>
    <div class="inst-value"><strong>${money(p.valor)}</strong><span>${text}</span></div>
    <button class="ghost-btn" onclick="markInstallmentReceived(${JSON.stringify(p.sourceId)},${p.numero})">Receber</button>
  </div>`;
}

async function markInstallmentReceived(sourceId, numero) {
  const entry = financeEntries.find(e=>String(e.id)===String(sourceId));
  if (!entry || !entry.parcelas) return;
  const parcela = entry.parcelas.find(p=>Number(p.numero)===Number(numero));
  if (!parcela || parcela.status==="recebida") return;
  parcela.status = "recebida";
  parcela.dataRecebimento = dateKey(new Date());
  await persistFinance();
  renderFinance();
  toast(`Parcela ${numero}/${entry.parcelas.length} marcada como recebida.`);
}

function renderFinanceChart(year, movements) {
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const vals = months.map((_,i)=>{
    const ms = movements.filter(m=>new Date(`${m.data}T12:00:00`).getMonth()===i);
    return {
      r:ms.filter(x=>x.tipo==="receita").reduce((s,x)=>s+x.valor,0),
      d:ms.filter(x=>x.tipo==="despesa").reduce((s,x)=>s+x.valor,0)
    };
  });
  const max = Math.max(1,...vals.flatMap(x=>[x.r,x.d]));
  $("financeChart").innerHTML = vals.map((v,i)=>`
    <div class="chart-month">
      <div class="chart-bars">
        <div class="bar receita" title="Receitas: ${money(v.r)}" style="height:${Math.max(2,v.r/max*165)}px"></div>
        <div class="bar despesa" title="Despesas: ${money(v.d)}" style="height:${Math.max(2,v.d/max*165)}px"></div>
      </div>
      <span>${months[i]}</span>
    </div>
  `).join("");
}

function renderCategories(list) {
  const map = {};
  list.forEach(x => { map[x.categoria || "Outros"] = (map[x.categoria || "Outros"] || 0) + x.valor; });
  const rows = Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const max = rows[0]?.[1] || 1;
  $("categoryList").innerHTML = rows.length ? rows.map(([name,val])=>`
    <div class="cat-row"><div class="cat-name">${esc(name)}</div><div class="cat-value">${money(val)}</div><div class="cat-track"><div class="cat-fill" style="width:${val/max*100}%"></div></div></div>
  `).join("") : `<div class="empty">Nenhuma movimentação no período.</div>`;
}

function renderFinanceTable(list) {
  const sorted = [...list].sort((a,b)=>b.data.localeCompare(a.data));
  $("financeTable").innerHTML = sorted.length ? sorted.map(m=>`
    <tr>
      <td>${formatDate(m.data)}</td>
      <td><strong>${esc(m.descricao)}</strong></td>
      <td>${esc(m.categoria || "Outros")}</td>
      <td><span class="status ${m.tipo==="receita"?"status-concluido":"status-atencao"}">${m.tipo==="receita"?"Receita":"Despesa"}</span></td>
      <td><strong>${money(m.valor)}</strong></td>
      <td>${m.sourceId ? `<button onclick="openFinanceDetail(${JSON.stringify(m.sourceId)})">Abrir</button>` : ""}</td>
    </tr>
  `).join("") : `<tr><td colspan="6"><div class="empty">Nenhuma movimentação no período.</div></td></tr>`;
}

function openFinanceForm(entry = null) {
  financeEditingId = entry?.id || null;
  $("financeFormTitle").textContent = entry ? "Editar movimentação" : "Nova movimentação";
  $("finTipo").value = entry?.tipo || "receita";
  $("finData").value = entry?.data || dateKey(new Date());
  $("finDescricao").value = entry?.descricao || "";
  $("finCategoria").value = entry?.categoria || "Honorários";
  $("finValor").value = entry?.valor || "";
  $("finObs").value = entry?.observacoes || "";
  const parcelado = Boolean(entry?.parcelado);
  $("finParcelado").checked = parcelado;
  $("finQtdParcelas").value = entry?.parcelas?.length || 2;
  $("finPeriodicidade").value = entry?.periodicidade || "mensal";
  $("finPrimeiraParcela").value = entry?.parcelas?.[0]?.dataVencimento || entry?.data || dateKey(new Date());
  $("finPrimeiraRecebida").value = entry?.parcelas?.[0]?.status === "recebida" ? "sim" : "nao";
  toggleInstallmentFields();
  renderParcelPreview();
  $("financeModal").classList.remove("hidden");
}

function closeFinanceForm() {
  $("financeModal").classList.add("hidden");
  financeEditingId = null;
}

function toggleInstallmentFields() {
  const on = $("finParcelado").checked;
  $("installmentFields").classList.toggle("hidden", !on);
  $("parcelPreview").classList.toggle("hidden", !on);
  if (on) $("finTipo").value = "receita";
  $("finTipo").disabled = on;
  renderParcelPreview();
}

function addInterval(date, periodicidade, n) {
  const d = new Date(`${date}T12:00:00`);
  if (periodicidade === "semanal") d.setDate(d.getDate() + 7*n);
  else if (periodicidade === "quinzenal") d.setDate(d.getDate() + 15*n);
  else {
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() !== day) d.setDate(0);
  }
  return dateKey(d);
}

function buildInstallments() {
  const qtd = Math.max(2, Number($("finQtdParcelas").value) || 2);
  const total = Number($("finValor").value) || 0;
  const base = total / qtd;
  const first = $("finPrimeiraParcela").value || $("finData").value || dateKey(new Date());
  const period = $("finPeriodicidade").value;
  const firstReceived = $("finPrimeiraRecebida").value === "sim";

  return Array.from({length:qtd},(_,i)=>({
    numero:i+1,
    totalParcelas:qtd,
    dataVencimento:addInterval(first,period,i),
    dataRecebimento:i===0 && firstReceived ? (dateKey(new Date()) === addInterval(first,period,0) ? dateKey(new Date()) : addInterval(first,period,0)) : "",
    status:i===0 && firstReceived ? "recebida" : "pendente",
    valor:i===qtd-1 ? Number((total - base*(qtd-1)).toFixed(2)) : Number(base.toFixed(2))
  }));
}

function renderParcelPreview() {
  if (!$("finParcelado").checked) return;
  const parcels = buildInstallments();
  $("parcelPreview").innerHTML = `<h4>PARCELAS GERADAS AUTOMATICAMENTE</h4>` + parcels.map(p=>`
    <div class="parcel-line"><span>${p.numero}/${p.totalParcelas} · ${formatDate(p.dataVencimento)}</span><b>${money(p.valor)} · ${p.status==="recebida"?"Recebida":"Pendente"}</b></div>
  `).join("");
}

async function saveFinanceForm(e) {
  e.preventDefault();
  const tipo = $("finTipo").value;
  const data = $("finData").value;
  const descricao = $("finDescricao").value.trim();
  const categoria = $("finCategoria").value;
  const valor = Number($("finValor").value);

  if (!data || !descricao || !valor || valor <= 0) return toast("Preencha data, descrição e um valor válido.", true);

  if ($("finParcelado").checked) {
    const parcelas = buildInstallments();
    const obj = {
      id: financeEditingId || nextId(financeEntries),
      tipo:"receita",
      data,
      descricao,
      categoria,
      valor,
      observacoes:$("finObs").value.trim(),
      parcelado:true,
      periodicidade:$("finPeriodicidade").value,
      parcelas
    };
    if (financeEditingId) {
      const idx = financeEntries.findIndex(x=>String(x.id)===String(financeEditingId));
      if (idx >= 0) financeEntries[idx] = obj;
    } else financeEntries.push(obj);
  } else {
    const obj = {
      id: financeEditingId || nextId(financeEntries),
      tipo,
      data,
      descricao,
      categoria,
      valor,
      observacoes:$("finObs").value.trim(),
      parcelado:false,
      parcelas:[]
    };
    if (financeEditingId) {
      const idx = financeEntries.findIndex(x=>String(x.id)===String(financeEditingId));
      if (idx >= 0) financeEntries[idx] = obj;
    } else financeEntries.push(obj);
  }

  await persistFinance();
  closeFinanceForm();
  setupFinanceYears();
  renderFinance();
  toast("Movimentação financeira salva.");
}

function openFinanceDetail(id) {
  financeDetailId = id;
  const e = financeEntries.find(x=>String(x.id)===String(id));
  if (!e) return;
  $("financeDetailTitle").textContent = e.descricao;
  const parcelas = e.parcelado ? e.parcelas.map(p=>`
    <tr><td>${p.numero}/${p.totalParcelas}</td><td>${formatDate(p.dataVencimento)}</td><td>${money(p.valor)}</td><td>${p.status==="recebida"?"Recebida":"Pendente"}</td><td>${p.status!=="recebida"?`<button onclick="markInstallmentReceived(${JSON.stringify(e.id)},${p.numero})">Receber</button>`:""}</td></tr>
  `).join("") : "";
  $("financeDetailContent").innerHTML = `<div class="detail-block">
    <div class="detail-grid">
      ${detailField("Tipo", e.tipo==="receita"?"Receita":"Despesa")}
      ${detailField("Valor total", money(e.valor))}
      ${detailField("Data", formatDate(e.data))}
      ${detailField("Categoria", e.categoria)}
    </div>
    ${e.observacoes ? `<div class="detail-note">${esc(e.observacoes)}</div>` : ""}
    ${e.parcelado ? `<div class="finance-detail-table"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${parcelas}</tbody></table></div>` : ""}
  </div>`;
  $("financeDetailModal").classList.remove("hidden");
}

function closeFinanceDetail() {
  $("financeDetailModal").classList.add("hidden");
  financeDetailId = null;
}

async function deleteFinanceDetail() {
  const e = financeEntries.find(x=>String(x.id)===String(financeDetailId));
  if (!e) return;
  if (!confirm(`Excluir "${e.descricao}" e todas as parcelas?`)) return;
  financeEntries = financeEntries.filter(x=>String(x.id)!==String(financeDetailId));
  await persistFinance();
  closeFinanceDetail();
  setupFinanceYears();
  renderFinance();
  toast("Movimentação excluída.");
}

function toast(message,error=false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error",error);
  el.classList.remove("hidden");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(()=>el.classList.add("hidden"),3500);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

window.openDetail = openDetail;
window.openFinanceDetail = openFinanceDetail;
window.markInstallmentReceived = async (id, numero) => {
  await markInstallmentReceived(id, numero);
  if (financeDetailId) {
    openFinanceDetail(financeDetailId);
  }
};