import { useRef, useState } from "react";

import { apiRequest } from "./lib/api";
import type { DataImportSummary } from "./types";

interface DataPageProps {
  accessToken: string;
  workspaceId: string;
  workspaceName: string;
  canImport: boolean;
}

interface SelectedBackup {
  name: string;
  size: number;
  data: Record<string, unknown> | unknown[];
  processCount: number | null;
  financeCount: number | null;
  sourceType: "processes" | "finance" | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function itemCount(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && "items" in value && Array.isArray(value.items)) {
    return value.items.length;
  }
  return null;
}

function backupCounts(data: Record<string, unknown> | unknown[], fileName: string): {
  processes: number | null;
  finances: number | null;
} {
  if (Array.isArray(data)) {
    return fileName.toLowerCase().includes("financ")
      ? { processes: null, finances: data.length }
      : { processes: data.length, finances: null };
  }
  const nested = data.data && typeof data.data === "object" && !Array.isArray(data.data)
    ? data.data as Record<string, unknown>
    : null;
  return {
    processes: itemCount(data.processes ?? nested?.processes),
    finances: itemCount(
      data.financial_entries
      ?? data.financeiro
      ?? data.finances
      ?? nested?.financial_entries
      ?? nested?.finances,
    ),
  };
}

function sourceTypeFor(data: Record<string, unknown> | unknown[], fileName: string): "processes" | "finance" | null {
  if (!Array.isArray(data)) return null;
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes("financ")) return "finance";
  if (lowerName.includes("process")) return "processes";
  return null;
}

export function DataPage({ accessToken, workspaceId, workspaceName, canImport }: DataPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<SelectedBackup | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<DataImportSummary | null>(null);
  const [result, setResult] = useState<DataImportSummary | null>(null);

  async function exportData() {
    setExporting(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiRequest<unknown>("/api/v1/data/export", {
        method: "GET",
        accessToken,
        workspaceId,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `processflow-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess("Backup exportado. O arquivo foi salvo na pasta de downloads.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível exportar os dados.");
    } finally {
      setExporting(false);
    }
  }

  async function chooseFile(file: File | undefined) {
    setSelected(null);
    setConfirmed(false);
    setPreview(null);
    setResult(null);
    setSuccess("");
    setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Escolha um arquivo JSON exportado pelo ProcessFlow.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("O arquivo é maior que 20 MB. Verifique se este é o backup correto.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      if (!parsed || typeof parsed !== "object") {
        throw new Error("O conteúdo precisa ser um JSON válido.");
      }
      const data = parsed as Record<string, unknown> | unknown[];
      const counts = backupCounts(data, file.name);
      setSelected({
        name: file.name,
        size: file.size,
        data,
        processCount: counts.processes,
        financeCount: counts.finances,
        sourceType: sourceTypeFor(data, file.name),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "O arquivo selecionado não contém um JSON válido.");
    }
  }

  function importPath(mode: "preview" | "merge", backup: SelectedBackup): string {
    const params = new URLSearchParams({ mode });
    if (backup.sourceType) params.set("source_type", backup.sourceType);
    return `/api/v1/data/import?${params}`;
  }

  async function validateImport() {
    if (!selected) return;
    setValidating(true);
    setError("");
    setSuccess("");
    setPreview(null);
    try {
      const checked = await apiRequest<DataImportSummary>(importPath("preview", selected), {
        method: "POST",
        accessToken,
        workspaceId,
        body: JSON.stringify(selected.data),
      });
      setPreview(checked);
      setConfirmed(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível validar o arquivo.");
    } finally {
      setValidating(false);
    }
  }

  async function importData() {
    if (!selected || !preview || !confirmed) return;
    setImporting(true);
    setError("");
    setSuccess("");
    setResult(null);
    try {
      const imported = await apiRequest<DataImportSummary>(importPath("merge", selected), {
        method: "POST",
        accessToken,
        workspaceId,
        body: JSON.stringify(selected.data),
      });
      setResult(imported);
      setSuccess(
        `Importação concluída: ${imported.processes.imported} processo(s) e ${imported.financial_entries.imported} lançamento(s) adicionados.`,
      );
      setSelected(null);
      setPreview(null);
      setConfirmed(false);
      if (inputRef.current) inputRef.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível importar os dados.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <>
      <section className="page-head data-heading">
        <div>
          <p className="eyebrow">BACKUP E MIGRAÇÃO</p>
          <h2>Importar e exportar dados</h2>
          <p>Proteja ou transfira os dados compartilhados de {workspaceName}.</p>
        </div>
      </section>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {success && <div className="success-banner" role="status">✓ {success}</div>}

      <section className="data-actions-grid">
        <article className="panel data-card">
          <div className="data-card-icon export" aria-hidden="true">↓</div>
          <div>
            <p className="eyebrow">CRIAR BACKUP</p>
            <h3>Exportar dados</h3>
            <p>Baixe processos e informações financeiras deste espaço em um único arquivo JSON.</p>
          </div>
          <button className="primary-btn" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? "Preparando arquivo…" : "Exportar arquivo JSON"}
          </button>
        </article>

        <article className="panel data-card">
          <div className="data-card-icon import" aria-hidden="true">↑</div>
          <div>
            <p className="eyebrow">RESTAURAR OU MIGRAR</p>
            <h3>Importar dados</h3>
            <p>Selecione um backup do ProcessFlow ou o arquivo antigo processos.json. O arquivo é validado no navegador antes do envio.</p>
          </div>
          {canImport ? (
            <label className="file-picker">
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                onChange={(event) => void chooseFile(event.target.files?.[0])}
              />
              <span>{selected ? "Trocar arquivo" : "Escolher arquivo JSON"}</span>
            </label>
          ) : (
            <div className="permission-note">Somente administradores podem importar dados neste espaço.</div>
          )}
        </article>
      </section>

      {selected && (
        <section className="panel import-confirmation" aria-labelledby="import-confirm-title">
          <header className="panel-head">
            <div>
              <p className="eyebrow">CONFIRMAÇÃO NECESSÁRIA</p>
              <h3 id="import-confirm-title">Revise antes de importar</h3>
            </div>
            <button
              className="icon-button"
              aria-label="Remover arquivo selecionado"
              onClick={() => {
                setSelected(null);
                setConfirmed(false);
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              ×
            </button>
          </header>
          <div className="import-body">
            <div className="selected-file">
              <div className="file-symbol">JSON</div>
              <div>
                <strong>{selected.name}</strong>
                <span>{formatFileSize(selected.size)}</span>
              </div>
            </div>

            {(selected.processCount !== null || selected.financeCount !== null) && (
              <div className="file-preview-counts">
                {selected.processCount !== null && <span><b>{selected.processCount}</b> processo(s) no arquivo</span>}
                {selected.financeCount !== null && <span><b>{selected.financeCount}</b> lançamento(s) financeiro(s)</span>}
              </div>
            )}

            {!preview ? (
              <>
                <div className="import-warning neutral">
                  <strong>Primeiro, valide o conteúdo.</strong>
                  <span>A validação não altera nenhum dado do espaço.</span>
                </div>
                <div className="import-actions">
                  <button className="ghost-btn" onClick={() => { setSelected(null); if (inputRef.current) inputRef.current.value = ""; }}>Cancelar</button>
                  <button className="primary-btn" disabled={validating} onClick={() => void validateImport()}>
                    {validating ? "Validando…" : "Validar arquivo"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="server-preview" role="status">
                  <div><span>Processos encontrados</span><strong>{preview.processes.received}</strong></div>
                  <div><span>Lançamentos encontrados</span><strong>{preview.financial_entries.received}</strong></div>
                  <div><span>Duplicados ignorados</span><strong>{preview.processes.skipped_duplicates + preview.financial_entries.skipped_duplicates}</strong></div>
                </div>
                {preview.warnings.length > 0 && <div className="preview-warnings"><strong>Avisos da validação</strong><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                <div className="import-warning">
                  <strong>Os dados serão importados para “{workspaceName}”.</strong>
                  <span>O modo mesclar preserva os dados atuais e ignora duplicidades identificadas.</span>
                </div>
                <label className="confirm-check">
                  <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  <span>Revisei a prévia e confirmo que desejo importar estes dados.</span>
                </label>
                <div className="import-actions">
                  <button className="ghost-btn" onClick={() => { setSelected(null); setPreview(null); setConfirmed(false); if (inputRef.current) inputRef.current.value = ""; }}>Cancelar</button>
                  <button className="primary-btn" disabled={!confirmed || importing} onClick={() => void importData()}>
                    {importing ? "Importando…" : "Confirmar importação"}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {result && (
        <section className="panel import-result">
          <p className="eyebrow">RESULTADO</p>
          <h3>Importação concluída</h3>
          <div>
            <span><b>{result.processes.imported}</b> processo(s) importado(s)</span>
            <span><b>{result.financial_entries.imported}</b> lançamento(s) importado(s)</span>
            <span><b>{result.processes.skipped_duplicates + result.financial_entries.skipped_duplicates}</b> duplicado(s) ignorado(s)</span>
          </div>
        </section>
      )}

      <aside className="data-help">
        <strong>Sobre o arquivo JSON</strong>
        <p>Guarde o backup em local seguro: ele pode conter informações de clientes e dados financeiros.</p>
      </aside>
    </>
  );
}
