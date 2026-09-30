const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  loadProcesses: () => ipcRenderer.invoke("data:load"),
  saveProcesses: (data) => ipcRenderer.invoke("data:save", data),

  loadFinance: () => ipcRenderer.invoke("finance:load"),
  saveFinance: (data) => ipcRenderer.invoke("finance:save", data),

  importTrello: () => ipcRenderer.invoke("trello:import"),
  createBackup: () => ipcRenderer.invoke("backup:create"),
  openExternal: (url) => ipcRenderer.invoke("shell:open", url),

  getDataPath: () => ipcRenderer.invoke("app:get-data-path"),
  getProcessFile: () => ipcRenderer.invoke("app:get-process-file"),
  getFinanceFile: () => ipcRenderer.invoke("app:get-finance-file")
});