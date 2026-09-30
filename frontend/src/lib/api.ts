const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "http://localhost:8000";

interface RequestOptions extends RequestInit {
  accessToken: string;
  workspaceId?: string;
}

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${options.accessToken}`);
  if (options.workspaceId) headers.set("X-Workspace-ID", options.workspaceId);
  if (options.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
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
