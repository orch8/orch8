const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, params?: QueryParams): string {
  const url = `${API_BASE}${path}`;
  if (!params) return url;
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null,
  );
  if (entries.length === 0) return url;
  const qs = new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)]),
  ).toString();
  return `${url}?${qs}`;
}

async function request<T>(
  path: string,
  options?: RequestInit,
  params?: QueryParams,
): Promise<T> {
  const url = buildUrl(path, params);
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, params?: QueryParams) =>
    request<T>(path, undefined, params),
  post: <T>(path: string, body: unknown, params?: QueryParams) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, params),
  put: <T>(path: string, body: unknown, params?: QueryParams) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, params),
  patch: <T>(path: string, body: unknown, params?: QueryParams) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, params),
  delete: <T>(path: string, params?: QueryParams) =>
    request<T>(path, { method: "DELETE" }, params),
};
