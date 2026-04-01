import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { BundledAgent, AddBundledAgents } from "@orch/shared";
import type { Agent } from "../types.js";

export function useBundledAgents() {
  return useQuery<BundledAgent[]>({
    queryKey: ["bundled-agents"],
    queryFn: () => api.get("/bundled-agents"),
    staleTime: Infinity, // Bundled agents don't change at runtime
  });
}

export function useAddBundledAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddBundledAgents) =>
      api.post<Agent[]>("/bundled-agents/add", input),
    onSuccess: (_agents, variables) => {
      qc.invalidateQueries({ queryKey: ["agents", variables.projectId] });
    },
  });
}
