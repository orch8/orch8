export interface PrCheck {
  name: string;
  status: string;
  url: string | null;
}

// GitHub returns CheckRun and StatusContext entries in statusCheckRollup.
// An empty array means GitHub reported no checks, never a green result.
export function readPrChecks(value: unknown): PrCheck[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((entry: unknown): PrCheck[] => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const name = row.__typename === "StatusContext" ? row.context : row.name;
    const status = row.__typename === "StatusContext" ? row.state : row.conclusion || row.status;
    if (typeof name !== "string" || !name.trim() || typeof status !== "string" || !status.trim()) return [];
    const candidate = row.__typename === "StatusContext" ? row.targetUrl : row.detailsUrl;
    const url = typeof candidate === "string" && /^https:\/\/github\.com\//.test(candidate) ? candidate : null;
    return [{ name, status, url }];
  });
}
