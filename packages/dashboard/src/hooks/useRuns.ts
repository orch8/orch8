import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Run, RunLog } from "../types.js";

export function useRuns(
  projectId: string,
  filters?: {
    agentId?: string;
    status?: string;
    taskId?: string;
    limit?: number;
  },
) {
  return useQuery<Run[]>({
    queryKey: ["runs", projectId, filters],
    queryFn: () => api.get("/runs", { projectId, ...filters }),
  });
}

export function useRun(runId: string | null, projectId: string) {
  return useQuery<Run>({
    queryKey: ["run", runId, projectId],
    queryFn: () => api.get(`/runs/${runId}`, { projectId }),
    enabled: !!runId,
  });
}

export function useRunLog(runId: string | null, projectId: string) {
  return useQuery<RunLog>({
    queryKey: ["runLog", runId],
    queryFn: () => api.get(`/runs/${runId}/log`, { projectId }),
    enabled: !!runId,
  });
}

export function useCancelRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      runId,
      projectId,
    }: {
      runId: string;
      projectId: string;
    }) => api.post<Run>(`/runs/${runId}/cancel`, { projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}
