import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Pipeline } from "../types.js";
import type { PipelineWithSteps } from "@orch/shared";

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

export interface PipelineRepositoryDiff {
  available: boolean;
  diff: string;
  baseBranch?: string;
  committedDiff?: string;
  workingDiff?: string;
  untrackedFiles?: string[];
  untrackedMore?: boolean;
  reason?: string;
}

export function usePipelineDiff(pipelineId: string) {
  return useQuery<PipelineRepositoryDiff>({
    queryKey: ["pipeline-diff", pipelineId],
    queryFn: () => api.get(`/pipelines/${encodeURIComponent(pipelineId)}/diff`),
  });
}

export function usePipelineStepOutput(pipelineId: string, stepId: string, revision: string, enabled: boolean) {
  return useQuery<{ path: string; content: string }>({
    queryKey: ["pipeline-output", pipelineId, stepId, revision],
    queryFn: () => api.get(`/pipelines/${encodeURIComponent(pipelineId)}/steps/${encodeURIComponent(stepId)}/output`),
    enabled,
    retry: false,
  });
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      name: string;
      templateId?: string;
      steps?: Array<{ label: string; agentId?: string; promptOverride?: string; requiresVerification?: boolean }>;
    }) => api.post<{ pipeline: Pipeline; steps: unknown[] }>("/pipelines", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
  });
}

export function useCancelPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) =>
      api.post<Pipeline>(`/pipelines/${pipelineId}/cancel`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
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
      qc.invalidateQueries({ queryKey: ["pipelines"] });
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
      qc.invalidateQueries({ queryKey: ["pipelines"] });
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
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      qc.invalidateQueries({ queryKey: ["pipeline", data.pipeline.id] });
    },
  });
}
