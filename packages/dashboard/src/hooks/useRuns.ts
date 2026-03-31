import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Run, RunLog } from "../types.js";

export function useRuns(
  projectId: string | null,
  filters?: {
    agentId?: string;
    status?: string;
    taskId?: string;
    limit?: number;
  },
) {
  return useQuery<Run[]>({
    queryKey: ["runs", projectId, filters],
    queryFn: () =>
      api.get("/runs", { projectId: projectId!, ...filters }),
    enabled: !!projectId,
  });
}

export function useRun(runId: string | null, projectId: string | null) {
  return useQuery<Run>({
    queryKey: ["run", runId, projectId],
    queryFn: () => api.get(`/runs/${runId}`, { projectId: projectId! }),
    enabled: !!runId && !!projectId,
  });
}

export function useRunLog(runId: string | null, projectId: string | null) {
  return useQuery<RunLog>({
    queryKey: ["runLog", runId],
    queryFn: () => api.get(`/runs/${runId}/log`, { projectId: projectId! }),
    enabled: !!runId && !!projectId,
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
