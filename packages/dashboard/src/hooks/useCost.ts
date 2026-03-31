import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type {
  CostSummary,
  CostTimeseriesPoint,
  TaskCost,
  PhaseCost,
} from "../types.js";

export function useCostSummary(projectId: string, agentId?: string) {
  return useQuery<CostSummary>({
    queryKey: ["costSummary", projectId, agentId],
    queryFn: () => api.get("/cost/summary", { projectId, agentId }),
  });
}

export function useCostTimeseries(projectId: string, days: number = 7) {
  return useQuery<CostTimeseriesPoint[]>({
    queryKey: ["costTimeseries", projectId, days],
    queryFn: () => api.get("/cost/timeseries", { projectId, days }),
  });
}

export function useTaskCost(taskId: string | null, projectId: string) {
  return useQuery<TaskCost>({
    queryKey: ["taskCost", taskId],
    queryFn: () => api.get(`/cost/task/${taskId}`, { projectId }),
    enabled: !!taskId,
  });
}

export function usePhaseCost(taskId: string | null, projectId: string) {
  return useQuery<PhaseCost>({
    queryKey: ["phaseCost", taskId],
    queryFn: () => api.get(`/cost/task/${taskId}/phases`, { projectId }),
    enabled: !!taskId,
  });
}
