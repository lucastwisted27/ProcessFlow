const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");

const USER_DATA_DIR = path.join(app.getPath("userData"), "data");
const PROCESS_DATA_FILE = path.join(USER_DATA_DIR, "processos.json");
const FINANCE_DATA_FILE = path.join(USER_DATA_DIR, "financeiro.json");
const PROJECT_PROCESS_FILE = path.join(__dirname, "processos.json");
const PROJECT_FINANCE_FILE = path.join(__dirname, "financeiro.json");

function ensureSeedFile(seedFile, targetFile) {
  const seed = fs.existsSync(seedFile) ? readJson(seedFile, []) : [];
  const target = fs.existsSync(targetFile) ? readJson(targetFile, []) : null;

  // Copia a base inicial quando o arquivo ainda não existe ou está vazio.
  // Isso evita que uma versão anterior do aplicativo deixe a instalação nova sem os processos.
  if (!fs.existsSync(targetFile) || (Array.isArray(target) && target.length === 0 && Array.isArray(seed) && seed.length > 0)) {
    writeJson(targetFile, Array.isArray(seed) ? seed : []);
  }
}

function ensureDataFiles() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  ensureSeedFile(PROJECT_PROCESS_FILE, PROCESS_DATA_FILE);
  ensureSeedFile(PROJECT_FINANCE_FILE, FINANCE_DATA_FILE);
}

function readJson(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function loadProcesses() {
  const data = readJson(PROCESS_DATA_FILE, []);
  return Array.isArray(data) ? data : [];
}

function saveProcesses(data) {
  if (!Array.isArray(data)) throw new Error("Dados de processos inválidos.");
  writeJson(PROCESS_DATA_FILE, data);
  return true;
}

function loadFinance() {
  const data = readJson(FINANCE_DATA_FILE, []);
  return Array.isArray(data) ? data : [];
}

function saveFinance(data) {
  if (!Array.isArray(data)) throw new Error("Dados financeiros inválidos.");
  writeJson(FINANCE_DATA_FILE, data);
  return true;
}

function normalizeTrelloCard(card, listName) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  const labelNames = labels.map((l) => l.name || l.color || "").filter(Boolean);
  const joined = labelNames.join(" ").toLowerCase();

  let status = "Em andamento";
  const list = String(listName || "").toUpperCase();

  if (list.includes("FINALIZ")) status = "Concluído";
  else if (list.includes("SOBREST")) status = "Sobrestado";

  let priority = "Normal";
  if (joined.includes("urg") || joined.includes("vermelh") || joined.includes("red")) priority = "Urgente";
  else if (joined.includes("alta") || joined.includes("orange") || joined.includes("laranja")) priority = "Alta";

  let nextAction = "Acompanhar";
  if (joined.includes("prazo") || joined.includes("deadline")) nextAction = "Verificar prazo";

  return {
    id: Date.now() + Math.floor(Math.random() * 100000),
    cliente: card.name || "Sem identificação",
    numero: card.idShort ? String(card.idShort) : "",
    tipo: listName || "Processo",
    data_prazo: card.due ? String(card.due).slice(0, 10) : "",
    proxima_acao: nextAction,
    prioridade: priority,
    status,
    observacoes: card.desc || "",
    origem: "Trello",
    anexos: Array.isArray(card.attachments)
      ? card.attachments.map((a) => ({ nome: a.name || "Anexo", url: a.url || "" }))
      : [],
    criado_em: new Date().toISOString()
  };
}

function importTrelloFile(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const lists = Array.isArray(raw.lists) ? raw.lists : [];
  const cards = Array.isArray(raw.cards) ? raw.cards : [];

  const listMap = new Map(lists.map((l) => [l.id, l.name || "Lista"]));
  return cards.map((card) => normalizeTrelloCard(card, listMap.get(card.idList) || "Processo"));
}

async function createBackup() {
  const result = await dialog.showSaveDialog({
    title: "Salvar backup",
    defaultPath: `ProcessFlow_Backup_${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }]
  });

  if (result.canceled || !result.filePath) return { canceled: true };

  const backup = {
    app: "ProcessFlow",
    version: "1.0",
    criado_em: new Date().toISOString(),
    processos: loadProcesses(),
    financeiro: loadFinance()
  };

  fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), "utf8");
  return { canceled: false, path: result.filePath };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "ProcessFlow",
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  ensureDataFiles();

  ipcMain.handle("data:load", () => loadProcesses());
  ipcMain.handle("data:save", (_event, data) => saveProcesses(data));

  ipcMain.handle("finance:load", () => loadFinance());
  ipcMain.handle("finance:save", (_event, data) => saveFinance(data));

  ipcMain.handle("trello:import", async () => {
    const result = await dialog.showOpenDialog({
      title: "Importar exportação do Trello",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    try {
      return { canceled: false, data: importTrelloFile(result.filePaths[0]) };
    } catch (error) {
      return { canceled: false, error: error.message };
    }
  });

  ipcMain.handle("backup:create", () => createBackup());

  ipcMain.handle("shell:open", async (_event, url) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle("app:get-data-path", () => USER_DATA_DIR);
  ipcMain.handle("app:get-process-file", () => PROCESS_DATA_FILE);
  ipcMain.handle("app:get-finance-file", () => FINANCE_DATA_FILE);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});