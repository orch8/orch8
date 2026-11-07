import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Pipeline } from "../types.js";
import type { PipelineWithSteps } from "@orch/shared";

export function usePipelines(projectId: string, poll = true) {
  return useQuery<Pipeline[]>({
    queryKey: ["pipelines", projectId],
    queryFn: () => api.get("/pipelines", { projectId }),
    refetchInterval: poll ? 10000 : false,
  });
}

export function usePipeline(pipelineId: string | null, poll = false) {
  return useQuery<PipelineWithSteps>({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => api.get(`/pipelines/${pipelineId}`),
    enabled: !!pipelineId,
    refetchInterval: poll ? 5000 : false,
  });
}

export interface PipelineRepositoryDiff {
  available: boolean;
  diff: string;
  baseBranch?: string;
  committedDiff?: string;
  workingDiff?: string;
  untrackedFiles?: string[];
  publicationOutputPaths?: string[];
  untrackedMore?: boolean;
  branch?: string;
  pullRequest?: { number: number; url: string; title: string; state: string; isDraft?: boolean; checks: Array<{ name: string; status: string; url: string | null }> } | null;
  prLookup?: "found" | "none" | "unavailable" | "not_applicable";
  reason?: string;
}

export function usePlanAttempts(pipelineId: string, enabled: boolean, poll = false) {
  return useQuery<Array<{ taskId: string; path: string; content: string | null }>>({
    queryKey: ["plan-attempts", pipelineId],
    queryFn: () => api.get(`/pipelines/${encodeURIComponent(pipelineId)}/plan-attempts`),
    enabled,
    refetchInterval: poll ? 5000 : false,
  });
}

export function useRepositoryChanges(projectId: string | undefined) {
  return useQuery<PipelineRepositoryDiff>({
    queryKey: ["repository-changes", projectId],
    queryFn: () => api.get(`/projects/${encodeURIComponent(projectId!)}/repository-changes`),
    enabled: !!projectId,
    staleTime: 0,
  });
}

export function usePipelineDiff(pipelineId: string) {
  return useQuery<PipelineRepositoryDiff>({
    queryKey: ["pipeline-diff", pipelineId],
    queryFn: () => api.get(`/pipelines/${encodeURIComponent(pipelineId)}/diff`),
  });
}

export function usePublishPipelinePr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, summary, tests }: { pipelineId: string; summary: string; tests: string }) =>
      api.post<{ url: string }>(`/pipelines/${encodeURIComponent(pipelineId)}/pull-request`, { summary, tests }),
    onSuccess: (_data, { pipelineId }) => {
      void qc.invalidateQueries({ queryKey: ["pipeline-diff", pipelineId] });
    },
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

export function useRequestPlanChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pipelineId, stepId, feedback }: { pipelineId: string; stepId: string; feedback: string }) =>
      api.post<{ pipeline: Pipeline }>(`/pipelines/${pipelineId}/steps/${stepId}/request-plan-changes`, { feedback }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      qc.invalidateQueries({ queryKey: ["pipeline", data.pipeline.id] });
      qc.invalidateQueries({ queryKey: ["plan-attempts", data.pipeline.id] });
    },
  });
}
