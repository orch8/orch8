import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Agent } from "../types.js";
import type { CreateAgent, UpdateAgent } from "@orch/shared";

export function useAgents(projectId: string) {
  return useQuery<Agent[]>({
    queryKey: ["agents", projectId],
    queryFn: () => api.get("/agents", { projectId }),
  });
}

export function useAgent(agentId: string, projectId: string) {
  return useQuery<Agent>({
    queryKey: ["agent", agentId, projectId],
    queryFn: () => api.get(`/agents/${agentId}`, { projectId }),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgent) => api.post<Agent>("/agents", input),
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ["agents", agent.projectId] });
    },
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      projectId,
      ...input
    }: UpdateAgent & { agentId: string; projectId: string }) =>
      api.patch<Agent>(`/agents/${agentId}`, input, { projectId }),
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ["agents", agent.projectId] });
      qc.invalidateQueries({
        queryKey: ["agent", agent.id, agent.projectId],
      });
    },
  });
}

export function usePauseAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      projectId,
      reason,
    }: {
      agentId: string;
      projectId: string;
      reason?: string;
    }) => api.post<Agent>(`/agents/${agentId}/pause`, { reason }, { projectId }),
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ["agents", agent.projectId] });
    },
  });
}

export function useResumeAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, projectId }: { agentId: string; projectId: string }) =>
      api.post<Agent>(`/agents/${agentId}/resume`, {}, { projectId }),
    onSuccess: (agent) => {
      qc.invalidateQueries({ queryKey: ["agents", agent.projectId] });
    },
  });
}

export function useWakeAgent() {
  return useMutation({
    mutationFn: ({
      agentId,
      projectId,
      taskId,
      reason,
    }: {
      agentId: string;
      projectId: string;
      taskId?: string;
      reason?: string;
    }) => api.post(`/agents/${agentId}/wake`, { taskId, reason }, { projectId }),
  });
}
