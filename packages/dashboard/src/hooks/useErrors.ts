import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { ErrorLog, ErrorLogSeverity, ErrorSummaryRow } from "../types.js";

export interface ErrorLogFilters {
  severity?: ErrorLogSeverity | "";
  source?: string;
  code?: string;
  agentId?: string;
  taskId?: string;
  runId?: string;
  chatId?: string;
  requestId?: string;
  unresolvedOnly?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export function errorsQueryKey(projectId: string, filters?: ErrorLogFilters) {
  return ["errors", projectId, filters] as const;
}

export function errorSummaryQueryKey(projectId: string) {
  return ["errors-summary", projectId] as const;
}

export function useErrors(projectId: string, filters?: ErrorLogFilters) {
  return useQuery<ErrorLog[]>({
    queryKey: errorsQueryKey(projectId, filters),
    queryFn: () =>
      api.get("/errors", {
        projectId,
        severity: filters?.severity || undefined,
        source: filters?.source || undefined,
        code: filters?.code || undefined,
        agentId: filters?.agentId || undefined,
        taskId: filters?.taskId || undefined,
        runId: filters?.runId || undefined,
        chatId: filters?.chatId || undefined,
        requestId: filters?.requestId || undefined,
        unresolvedOnly: filters?.unresolvedOnly,
        from: filters?.from || undefined,
        to: filters?.to || undefined,
        limit: filters?.limit ?? 100,
        offset: filters?.offset ?? 0,
      }),
  });
}

export function useErrorSummary(projectId: string) {
  return useQuery<ErrorSummaryRow[]>({
    queryKey: errorSummaryQueryKey(projectId),
    queryFn: () => api.get("/errors/summary", { projectId, unresolvedOnly: true }),
  });
}

export function useResolveError(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (errorId: string) =>
      api.patch<ErrorLog>(`/errors/${errorId}/resolve`, {
        resolvedBy: "dashboard",
      }),
    onSuccess: (_error, errorId) => {
      qc.invalidateQueries({ queryKey: ["errors", projectId] });
      qc.invalidateQueries({ queryKey: errorSummaryQueryKey(projectId) });
      qc.invalidateQueries({ queryKey: ["error", errorId] });
    },
  });
}
