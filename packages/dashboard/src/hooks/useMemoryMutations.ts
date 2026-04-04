import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Entity } from "../types.js";

export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; name: string; entityType: string; description?: string }) => {
      const { projectId, ...body } = input;
      const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return api.post<Entity>("/memory/knowledge", { ...body, slug }, { projectId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entities"] });
    },
  });
}

export function useSupersedeFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entityId,
      factId,
      newContent,
      category,
    }: {
      entityId: string;
      factId: string;
      newContent: string;
      category: string;
    }) => api.post(`/memory/knowledge/${entityId}/facts/${factId}/supersede`, { content: newContent, category }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["entityFacts", vars.entityId] });
    },
  });
}

export function useRegenerateSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entityId: string) =>
      api.post(`/memory/knowledge/${entityId}/summarize`, {}),
    onSuccess: (_, entityId) => {
      qc.invalidateQueries({ queryKey: ["entity", entityId] });
    },
  });
}
