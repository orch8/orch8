import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Pipeline, PipelineWithSteps } from "../types.js";

export function usePipelines(projectId: string) {
  return useQuery<Pipeline[]>({
    queryKey: ["pipelines", projectId],
    queryFn: () => api.get("/pipelines", { projectId }),
  });
}

export function usePipeline(pipelineId: string | null) {
  return useQuery<PipelineWithSteps>({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => api.get(`/pipelines/${pipelineId}`),
    enabled: !!pipelineId,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      name: string;
      templateId?: string;
      steps?: Array<{ label: string; agentId?: string; promptOverride?: string }>;
    }) => api.post<{ pipeline: Pipeline; steps: unknown[] }>("/pipelines", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines", data.pipeline.projectId] });
    },
  });
}

export function useCancelPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) =>
      api.post<Pipeline>(`/pipelines/${pipelineId}/cancel`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines", data.projectId] });
      qc.invalidateQueries({ queryKey: ["pipeline", data.id] });
    },
  });
}

export function useRetryPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) =>
      api.post<{ pipeline: Pipeline }>(`/pipelines/${pipelineId}/retry`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines", data.pipeline.projectId] });
      qc.invalidateQueries({ queryKey: ["pipeline", data.pipeline.id] });
    },
  });
}

export function useRejectPipelineStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pipelineId,
      stepId,
      targetStepId,
      feedback,
    }: {
      pipelineId: string;
      stepId: string;
      targetStepId: string;
      feedback: string;
    }) =>
      api.post<{
        pipeline: Pipeline;
        rejectedStep: unknown;
        targetStep: unknown;
        newTask: unknown;
      }>(`/pipelines/${pipelineId}/steps/${stepId}/reject`, {
        targetStepId,
        feedback,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines", data.pipeline.projectId] });
      qc.invalidateQueries({ queryKey: ["pipeline", data.pipeline.id] });
    },
  });
}

export function useApprovePipelineStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      pipelineId,
      stepId,
    }: {
      pipelineId: string;
      stepId: string;
    }) =>
      api.post<{
        pipeline: Pipeline;
        approvedStep: unknown;
        nextStep: unknown;
        nextTask: unknown;
      }>(`/pipelines/${pipelineId}/steps/${stepId}/approve`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines", data.pipeline.projectId] });
      qc.invalidateQueries({ queryKey: ["pipeline", data.pipeline.id] });
    },
  });
}
