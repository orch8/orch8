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

export interface SaveProjectSkillInput {
  name: string;
  description?: string | null;
  markdown?: string;
  assignedAgentIds?: string[];
}

export function useCreateProjectSkill(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveProjectSkillInput & { slug?: string }) =>
      api.post<ProjectSkill>(`/projects/${projectId}/skills`, input),
    onSuccess: (skill) => {
      qc.invalidateQueries({ queryKey: ["project-skills", projectId] });
      qc.invalidateQueries({ queryKey: ["agents", projectId] });
      qc.setQueryData(["project-skill", projectId, skill.id], skill);
    },
  });
}

export function useUpdateProjectSkill(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, ...input }: SaveProjectSkillInput & { skillId: string }) =>
      api.patch<ProjectSkill>(`/projects/${projectId}/skills/${skillId}`, input),
    onSuccess: (skill, variables) => {
      qc.invalidateQueries({ queryKey: ["project-skills", projectId] });
      qc.invalidateQueries({ queryKey: ["agents", projectId] });
      qc.setQueryData(["project-skill", projectId, skill.id], skill);
      if (variables.skillId !== skill.id) {
        qc.setQueryData(["project-skill", projectId, variables.skillId], skill);
      }
    },
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
