import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

export interface AgentInstructions {
  agentsMd: string;
  heartbeatMd: string;
}

export function useAgentInstructions(agentId: string, projectId: string) {
  return useQuery<AgentInstructions>({
    queryKey: ["agentInstructions", agentId, projectId],
    queryFn: () =>
      api.get<AgentInstructions>(`/agents/${agentId}/instructions`, {
        projectId,
      }),
    staleTime: 5_000,
  });
}

export function useWriteAgentInstructions(agentId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AgentInstructions>) =>
      api.put(`/agents/${agentId}/instructions`, input, { projectId }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["agentInstructions", agentId, projectId],
      });
    },
  });
}
