const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:8000";

interface RequestOptions extends RequestInit {
  accessToken: string;
  workspaceId?: string;
}

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [1_200, 2_500];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${options.accessToken}`);
  if (options.workspaceId) headers.set("X-Workspace-ID", options.workspaceId);
  if (options.body) headers.set("Content-Type", "application/json");

  const method = (options.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" ? RETRY_DELAYS_MS.length + 1 : 1;
  let response: Response | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${API_URL}${path}`, { ...options, headers });
    } catch {
      if (attempt < maxAttempts - 1) {
        await wait(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw new Error("O servidor demorou para responder. Aguarde alguns segundos e clique em Atualizar.");
    }

    if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxAttempts - 1) {
      await wait(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    break;
  }

  if (!response) {
    throw new Error("Não foi possível acessar o servidor. Clique em Atualizar para tentar novamente.");
  }

  if (!response.ok) {
    if (RETRYABLE_STATUS_CODES.has(response.status)) {
      throw new Error("O servidor está iniciando. Aguarde alguns segundos e clique em Atualizar.");
    }
    let message = `Erro ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      const detail = body.detail;
      if (typeof detail === "string") {
        message = detail;
      } else if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        const payload = detail as { message?: unknown; errors?: unknown };
        const main = typeof payload.message === "string" ? payload.message : "";
        const firstError = Array.isArray(payload.errors) ? payload.errors[0] : undefined;
        const extra = typeof firstError === "string"
          ? firstError
          : firstError && typeof firstError === "object"
            ? String((firstError as { message?: unknown; msg?: unknown }).message ?? (firstError as { msg?: unknown }).msg ?? "")
            : "";
        message = [main, extra].filter(Boolean).join(" ") || message;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const first = detail[0];
        if (first && typeof first === "object" && "msg" in first) message = String(first.msg);
      }
    } catch {
      // A resposta pode não ser JSON em uma falha de infraestrutura.
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
