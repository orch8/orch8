import { useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "../../../components/ui/PageHeader.js";
import { StatGrid } from "../../../components/ui/StatGrid.js";
import { Badge } from "../../../components/ui/Badge.js";
import { Button } from "../../../components/ui/Button.js";
import { useErrorSummary, useErrors, useResolveError } from "../../../hooks/useErrors.js";
import type { ErrorLog, ErrorLogSeverity, ErrorSummaryRow } from "../../../types.js";

const PAGE_SIZE = 50;

const SEVERITY_BADGE: Record<ErrorLogSeverity, "warning" | "error" | "destructive"> = {
  warn: "warning",
  error: "error",
  fatal: "destructive",
};

const SEVERITY_DOT: Record<ErrorLogSeverity, string> = {
  warn: "bg-yellow-500",
  error: "bg-red-500",
  fatal: "bg-red-300",
};

function ErrorsPage() {
  const { projectSlug: projectId } = Route.useParams();
  const [severityFilter, setSeverityFilter] = useState<ErrorLogSeverity | "">("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [unresolvedOnly, setUnresolvedOnly] = useState(true);
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      severity: severityFilter,
      source: sourceFilter,
      code: codeFilter,
      unresolvedOnly,
      limit: PAGE_SIZE,
      offset,
    }),
    [codeFilter, offset, severityFilter, sourceFilter, unresolvedOnly],
  );

  const { data: errors, isLoading } = useErrors(projectId, filters);
  const { data: summary } = useErrorSummary(projectId);
  const resolveError = useResolveError(projectId);
  const stats = useMemo(() => buildStats(summary, errors), [summary, errors]);

  function resetPage() {
    setOffset(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Errors"
        subtitle="Structured daemon, API, agent, and provider failures for this project"
      />

      <StatGrid
        items={[
          { label: "Unresolved", value: stats.unresolved },
          { label: "Fatal", value: stats.fatal },
          { label: "Errors", value: stats.error },
          { label: "Warnings", value: stats.warn },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value as ErrorLogSeverity | "");
            resetPage();
          }}
          aria-label="Filter by severity"
          className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300"
        >
          <option value="">All severities</option>
          <option value="fatal">Fatal</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
        </select>

        <input
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value);
            resetPage();
          }}
          placeholder="Source..."
          aria-label="Filter by source"
          className="w-36 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 placeholder-zinc-600"
        />

        <input
          value={codeFilter}
          onChange={(e) => {
            setCodeFilter(e.target.value);
            resetPage();
          }}
          placeholder="Code..."
          aria-label="Filter by code"
          className="w-52 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300 placeholder-zinc-600"
        />

        <label className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={unresolvedOnly}
            onChange={(e) => {
              setUnresolvedOnly(e.target.checked);
              resetPage();
            }}
            className="size-4 accent-zinc-200"
          />
          Unresolved
        </label>
      </div>

      {isLoading && <p className="text-sm text-zinc-600">Loading errors...</p>}

      <div className="overflow-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
              <th className="w-8 px-3 py-2"> </th>
              <th className="px-3 py-2">Last seen</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Message</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {errors?.map((error) => {
              const expanded = expandedId === error.id;
              return (
                <tr key={error.id} className="border-b border-zinc-800/50 align-top">
                  <td className="px-3 py-2">
                    <button
                      aria-label={expanded ? "Collapse error details" : "Expand error details"}
                      onClick={() => setExpandedId(expanded ? null : error.id)}
                      className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    >
                      {expanded ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                    {formatDate(error.lastSeenAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={SEVERITY_BADGE[error.severity] ?? "outline"}>
                      <span className={`size-1.5 rounded-full ${SEVERITY_DOT[error.severity] ?? "bg-zinc-500"}`} />
                      {error.severity}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-400">{error.source}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-300">{error.code}</td>
                  <td className="max-w-xl px-3 py-2 text-zinc-300">
                    <div className="line-clamp-2">{error.message}</div>
                    {expanded && <ErrorDetails error={error} />}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-zinc-400">{error.occurrences}</td>
                  <td className="px-3 py-2">
                    {error.resolvedAt ? (
                      <span className="text-xs text-zinc-500">Resolved</span>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => resolveError.mutate(error.id)}
                        disabled={resolveError.isPending}
                      >
                        <CheckIcon />
                        Resolve
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {errors?.length === 0 && !isLoading && (
          <p className="py-8 text-center text-sm text-zinc-600">No errors found</p>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          disabled={offset === 0}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          Newer
        </button>
        <button
          onClick={() => setOffset(offset + PAGE_SIZE)}
          disabled={(errors?.length ?? 0) < PAGE_SIZE}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
        >
          Older
        </button>
      </div>
    </div>
  );
}

function ErrorDetails({ error }: { error: ErrorLog }) {
  const metadata = formatJson(error.metadata);
  return (
    <div className="mt-3 space-y-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Error ID" value={error.id} />
        <Detail label="Agent" value={error.agentId} />
        <Detail label="Task" value={error.taskId} />
        <Detail label="Run" value={error.runId} />
        <Detail label="Chat" value={error.chatId} />
        <Detail label="Request" value={error.requestId} />
        <Detail label="HTTP" value={formatHttp(error)} />
        <Detail label="First seen" value={formatDate(error.firstSeenAt)} />
        <Detail label="Resolved by" value={error.resolvedBy} />
      </dl>
      {error.stack && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-400">
          {error.stack}
        </pre>
      )}
      {metadata && (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-400">
          {metadata}
        </pre>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="truncate font-mono text-zinc-400">{value || "-"}</dd>
    </div>
  );
}

function buildStats(summary: ErrorSummaryRow[] | undefined, errors: ErrorLog[] | undefined) {
  const stats = { unresolved: 0, fatal: 0, error: 0, warn: 0 };
  if (summary?.length) {
    for (const row of summary) {
      const count = Number(row.unresolved ?? row.count ?? 0);
      if (row.severity === "fatal") stats.fatal += count;
      if (row.severity === "error") stats.error += count;
      if (row.severity === "warn") stats.warn += count;
      stats.unresolved += count;
    }
    return stats;
  }

  for (const error of errors ?? []) {
    if (!error.resolvedAt) stats.unresolved += 1;
    if (error.severity === "fatal") stats.fatal += 1;
    if (error.severity === "error") stats.error += 1;
    if (error.severity === "warn") stats.warn += 1;
  }
  return stats;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatHttp(error: ErrorLog) {
  if (!error.httpMethod && !error.httpPath && !error.httpStatus) return null;
  return [error.httpMethod, error.httpPath, error.httpStatus ? `HTTP ${error.httpStatus}` : null]
    .filter(Boolean)
    .join(" ");
}

function formatJson(value: unknown) {
  if (!value) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export const Route = createFileRoute("/projects/$projectSlug/errors")({
  component: ErrorsPage,
});
