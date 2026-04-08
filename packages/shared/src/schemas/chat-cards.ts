import { z } from "zod";

// ─── Shared building blocks ─────────────────────────────

export const TaskColumnEnum = z.enum(["backlog", "blocked", "in_progress", "done"]);
export const TaskTypeEnum = z.enum(["quick", "brainstorm"]);
export const TaskPriorityEnum = z.enum(["high", "medium", "low"]);

export const AgentRoleEnum = z.enum([
  "cto", "engineer", "qa", "researcher", "planner",
  "implementer", "reviewer", "verifier", "referee", "custom",
]);
export const AgentStatusEnum = z.enum(["active", "paused", "terminated"]);

export const RunStatusEnum = z.enum([
  "queued", "running", "succeeded", "failed", "timed_out", "cancelled",
]);

export const PipelineStepStatusEnum = z.enum([
  "pending", "running", "completed", "skipped", "failed", "awaiting_verification",
]);

// ─── Summaries used inside info_* card payloads ─────────

export const TaskSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  column: TaskColumnEnum,
  taskType: TaskTypeEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assignee: z.string().nullable().optional(),
});
export type TaskSummary = z.infer<typeof TaskSummarySchema>;

export const TaskDetailSchema = TaskSummarySchema.extend({
  description: z.string().optional(),
  branch: z.string().nullable().optional(),
  pipelineId: z.string().nullable().optional(),
  pipelineStepId: z.string().nullable().optional(),
});
export type TaskDetail = z.infer<typeof TaskDetailSchema>;

export const AgentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: AgentRoleEnum,
  model: z.string(),
  status: AgentStatusEnum,
});
export type AgentSummary = z.infer<typeof AgentSummarySchema>;

export const AgentDetailSchema = AgentSummarySchema.extend({
  effort: z.string().nullable().optional(),
  maxTurns: z.number().int().optional(),
  heartbeatEnabled: z.boolean().optional(),
  heartbeatIntervalSec: z.number().int().optional(),
  desiredSkills: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  budgetLimitUsd: z.number().nullable().optional(),
  budgetSpentUsd: z.number().optional(),
});
export type AgentDetail = z.infer<typeof AgentDetailSchema>;

export const RunSummarySchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string().optional(),
  status: RunStatusEnum,
  costUsd: z.number().nullable().optional(),
  startedAt: z.string(),
  durationSec: z.number().nullable().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunDetailSchema = RunSummarySchema.extend({
  taskId: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  exitCode: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
});
export type RunDetail = z.infer<typeof RunDetailSchema>;

export const BudgetEntrySchema = z.object({
  entityId: z.string(),
  name: z.string(),
  scope: z.enum(["agent", "project"]),
  limitUsd: z.number().nullable(),
  spentUsd: z.number(),
  percentUsed: z.number().nullable(),
  paused: z.boolean(),
});
export type BudgetEntry = z.infer<typeof BudgetEntrySchema>;

export const PipelineSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  stepCount: z.number().int(),
  lastRunAt: z.string().nullable().optional(),
  lastRunStatus: z.string().nullable().optional(),
});
export type PipelineSummary = z.infer<typeof PipelineSummarySchema>;

export const PipelineRunSummarySchema = z.object({
  runId: z.string(),
  status: z.string(),
  startedAt: z.string(),
  durationSec: z.number().nullable().optional(),
});
export type PipelineRunSummary = z.infer<typeof PipelineRunSummarySchema>;

export const PipelineStepInputSchema = z.object({
  order: z.number().int(),
  label: z.string(),
  defaultAgentId: z.string().optional(),
  promptTemplate: z.string().optional(),
  requiresVerification: z.boolean().optional(),
});
export type PipelineStepInput = z.infer<typeof PipelineStepInputSchema>;

export const MemorySearchResultSchema = z.object({
  kind: z.enum(["fact", "lesson", "entity"]),
  id: z.string(),
  snippet: z.string(),
});
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

// ─── Generic envelope helpers ───────────────────────────

/**
 * Wraps a payload schema in the standard `{ kind, summary, payload }`
 * envelope. We declare card schemas via this helper so the discriminated
 * union works (each entry has a literal `kind` discriminator).
 */
function envelope<K extends string, P extends z.ZodTypeAny>(
  kind: K,
  payload: P,
) {
  return z.object({
    kind: z.literal(kind),
    summary: z.string(),
    payload,
  });
}

/**
 * Standard `result_*` payload: a brief success banner referencing the
 * created/affected entity.
 */
export const ResultEntityPayloadSchema = z.object({
  entityId: z.string().optional(),
  entityKind: z.string().optional(),
  message: z.string().optional(),
  fieldsChanged: z.array(z.string()).optional(),
});
export type ResultEntityPayload = z.infer<typeof ResultEntityPayloadSchema>;
