const DEFAULT_BASE = "http://localhost:3847/api";

export class OrcherClient {
  constructor(private baseUrl: string = DEFAULT_BASE) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      const requestId = res.headers.get("x-request-id");
      const suffix = requestId ? ` [req_id=${requestId}]` : "";
      throw new Error(`${method} ${path} failed (${res.status})${suffix}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }
  post<T>(path: string, body: unknown) {
    return this.request<T>("POST", path, body);
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }
}
