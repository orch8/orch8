import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

interface ProjectSkill {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string | null;
  trustLevel: string;
  sourceType: string;
  markdown: string;
  sourceLocator: string | null;
  fileInventory: Array<{ path: string; kind: string }>;
}

export function useProjectSkills(projectId: string) {
  return useQuery({
    queryKey: ["projectSkills", projectId],
    queryFn: () => api.get<ProjectSkill[]>(`/projects/${projectId}/skills`),
    staleTime: 5_000,
  });
}

export function useSyncProjectSkills(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ synced: number }>(`/projects/${projectId}/skills/sync`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projectSkills", projectId] }),
  });
}
