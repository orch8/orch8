import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Entity, Fact } from "../types.js";

export function useEntities(projectId: string | null, entityType?: string) {
  return useQuery<Entity[]>({
    queryKey: ["entities", projectId, entityType],
    queryFn: () =>
      api.get("/memory/knowledge", { projectId: projectId!, entityType }),
    enabled: !!projectId,
  });
}

export function useEntity(entityId: string | null) {
  return useQuery<Entity>({
    queryKey: ["entity", entityId],
    queryFn: () => api.get(`/memory/knowledge/${entityId}`),
    enabled: !!entityId,
  });
}

export function useEntityFacts(entityId: string | null) {
  return useQuery<Fact[]>({
    queryKey: ["entityFacts", entityId],
    queryFn: () => api.get(`/memory/knowledge/${entityId}/facts`),
    enabled: !!entityId,
  });
}

export function useSearchFacts(query: string) {
  return useQuery<Fact[]>({
    queryKey: ["factSearch", query],
    queryFn: () => api.get("/memory/knowledge/search", { query }),
    enabled: query.length > 0,
  });
}

export function useWorklog(agentId?: string) {
  return useQuery<{ entries: Array<{ content: string }> }>({
    queryKey: ["worklog", agentId],
    queryFn: () => api.get("/memory/worklog", { agentId }),
  });
}

export function useLessons(agentId?: string) {
  return useQuery<{ content: string }>({
    queryKey: ["lessons", agentId],
    queryFn: () => api.get("/memory/lessons", { agentId }),
  });
}

export function useCreateFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entityId,
      ...input
    }: {
      entityId: string;
      content: string;
      category: string;
      sourceTask?: string;
    }) => api.post(`/memory/knowledge/${entityId}/facts`, input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["entityFacts", vars.entityId] });
    },
  });
}
