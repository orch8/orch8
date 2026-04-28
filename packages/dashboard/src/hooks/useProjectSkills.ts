import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { ProjectSkill } from "../types.js";

export function useProjectSkills(projectId: string) {
  return useQuery({
    queryKey: ["project-skills", projectId],
    queryFn: () => api.get<ProjectSkill[]>(`/projects/${projectId}/skills`),
    staleTime: 5_000,
  });
}

export function useProjectSkill(projectId: string, skillId: string | null) {
  return useQuery({
    queryKey: ["project-skill", projectId, skillId],
    queryFn: () =>
      api.get<ProjectSkill>(`/projects/${projectId}/skills/${skillId}`),
    enabled: Boolean(skillId),
    staleTime: 5_000,
  });
}

export function useSyncProjectSkills(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ synced: number }>(`/projects/${projectId}/skills/sync`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-skills", projectId] }),
  });
}

export function useDeleteProjectSkill(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      api.delete<void>(`/projects/${projectId}/skills/${skillId}`),
    onSuccess: (_data, skillId) => {
      qc.invalidateQueries({ queryKey: ["project-skills", projectId] });
      qc.removeQueries({ queryKey: ["project-skill", projectId, skillId] });
    },
  });
}
