import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Project } from "../types.js";
import type { CreateProject, UpdateProject } from "@orch/shared";

export function useProjects(active?: boolean) {
  return useQuery<Project[]>({
    queryKey: ["projects", active],
    queryFn: () =>
      api.get("/projects", active !== undefined ? { active } : undefined),
  });
}

export function useProject(projectId: string | null) {
  return useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: () => api.get(`/projects/${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProject) =>
      api.post<Project>("/projects", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post<Project>(`/projects/${projectId}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...input
    }: UpdateProject & { projectId: string }) =>
      api.patch<Project>(`/projects/${projectId}`, input),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    },
  });
}
