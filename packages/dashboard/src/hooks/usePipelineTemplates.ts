import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { PipelineTemplate } from "../types.js";

export function usePipelineTemplates(projectId: string) {
  return useQuery<PipelineTemplate[]>({
    queryKey: ["pipeline-templates", projectId],
    queryFn: () => api.get("/pipeline-templates", { projectId }),
  });
}

export function useCreatePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      name: string;
      description?: string;
      isDefault?: boolean;
      steps: Array<{ order: number; label: string; defaultAgentId?: string; promptTemplate?: string }>;
    }) => api.post<PipelineTemplate>("/pipeline-templates", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipeline-templates", data.projectId] });
    },
  });
}

export function useUpdatePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: {
      id: string;
      name?: string;
      description?: string;
      isDefault?: boolean;
      steps?: Array<{ order: number; label: string; defaultAgentId?: string; promptTemplate?: string }>;
    }) => api.patch<PipelineTemplate>(`/pipeline-templates/${id}`, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipeline-templates", data.projectId] });
    },
  });
}

export function useDeletePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/pipeline-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-templates"] });
    },
  });
}
