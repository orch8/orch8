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

// ─── Confirm cards: tasks ───────────────────────────────

const TaskCreateInputSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  column: TaskColumnEnum.optional(),
  taskType: TaskTypeEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assignee: z.string().optional(),
});

const TaskPatchSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  column: TaskColumnEnum.optional(),
  taskType: TaskTypeEnum.optional(),
  priority: TaskPriorityEnum.optional(),
  assignee: z.string().nullable().optional(),
});

export const ConfirmCreateTaskCardSchema = envelope(
  "confirm_create_task",
  TaskCreateInputSchema,
);

export const ConfirmUpdateTaskCardSchema = envelope(
  "confirm_update_task",
  z.object({
    taskId: z.string(),
    current: TaskPatchSchema,
    proposed: TaskPatchSchema,
  }),
);

export const ConfirmAssignTaskCardSchema = envelope(
  "confirm_assign_task",
  z.object({
    taskId: z.string(),
    currentAssignee: z.string().nullable().optional(),
    proposedAssignee: z.string(),
  }),
);

export const ConfirmMoveTaskCardSchema = envelope(
  "confirm_move_task",
  z.object({
    taskId: z.string(),
    from: TaskColumnEnum,
    to: TaskColumnEnum,
  }),
);

export const ConfirmConvertTaskCardSchema = envelope(
  "confirm_convert_task",
  z.object({
    taskId: z.string(),
    from: TaskTypeEnum,
    to: TaskTypeEnum,
  }),
);

export const ConfirmKillTaskCardSchema = envelope(
  "confirm_kill_task",
  z.object({
    taskId: z.string(),
    currentRunId: z.string().nullable().optional(),
  }),
);

export const ConfirmDeleteTaskCardSchema = envelope(
  "confirm_delete_task",
  z.object({
    taskId: z.string(),
    title: z.string(),
  }),
);

// ─── Confirm cards: agents ──────────────────────────────

const AgentCreateInputSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  role: AgentRoleEnum,
  model: z.string(),
  effort: z.string().optional(),
  maxTurns: z.number().int().min(1).optional(),
  heartbeatEnabled: z.boolean().optional(),
  heartbeatIntervalSec: z.number().int().min(0).optional(),
  desiredSkills: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  budgetLimitUsd: z.number().nonnegative().nullable().optional(),
  // Proposed AGENTS.md / heartbeat.md contents drafted during the
  // brainstorm. Carried on the confirm card so the user approves the
  // agent's substance alongside its config; on approval the chat agent
  // writes them via PUT /api/agents/{id}/instructions. Capped well
  // below the chat-cards transport limits so a runaway prompt can't
  // balloon a single card past the message size budget.
  agentsMd: z.string().max(50_000).optional(),
  heartbeatMd: z.string().max(20_000).optional(),
});

const AgentPatchSchema = z.object({
  name: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().nullable().optional(),
  maxTurns: z.number().int().min(1).optional(),
  heartbeatEnabled: z.boolean().optional(),
  heartbeatIntervalSec: z.number().int().min(0).optional(),
  desiredSkills: z.array(z.string()).optional(),
  allowedTools: z.array(z.string()).optional(),
  budgetLimitUsd: z.number().nullable().optional(),
});

export const ConfirmCreateAgentCardSchema = envelope(
  "confirm_create_agent",
  AgentCreateInputSchema,
);

export const ConfirmUpdateAgentCardSchema = envelope(
  "confirm_update_agent",
  z.object({
    agentId: z.string(),
    current: AgentPatchSchema,
    proposed: AgentPatchSchema,
  }),
);

export const ConfirmPauseAgentCardSchema = envelope(
  "confirm_pause_agent",
  z.object({
    agentId: z.string(),
    name: z.string(),
    reason: z.string().optional(),
  }),
);

export const ConfirmResumeAgentCardSchema = envelope(
  "confirm_resume_agent",
  z.object({
    agentId: z.string(),
    name: z.string(),
  }),
);

export const ConfirmDeleteAgentCardSchema = envelope(
  "confirm_delete_agent",
  z.object({
    agentId: z.string(),
    name: z.string(),
  }),
);

// ─── Confirm cards: pipelines ───────────────────────────

export const ConfirmCreatePipelineCardSchema = envelope(
  "confirm_create_pipeline",
  z.object({
    name: z.string(),
    templateId: z.string().optional(),
    steps: z.array(PipelineStepInputSchema).optional(),
  }),
);

export const ConfirmUpdatePipelineCardSchema = envelope(
  "confirm_update_pipeline",
  z.object({
    pipelineId: z.string(),
    current: z.record(z.unknown()),
    proposed: z.record(z.unknown()),
  }),
);

export const ConfirmRunPipelineCardSchema = envelope(
  "confirm_run_pipeline",
  z.object({
    pipelineId: z.string(),
    name: z.string(),
    inputs: z.record(z.unknown()).optional(),
  }),
);

export const ConfirmDeletePipelineCardSchema = envelope(
  "confirm_delete_pipeline",
  z.object({
    pipelineId: z.string(),
    name: z.string(),
  }),
);

// ─── Confirm cards: runs ────────────────────────────────

export const ConfirmKillRunCardSchema = envelope(
  "confirm_kill_run",
  z.object({
    runId: z.string(),
    agentName: z.string(),
    taskTitle: z.string().optional(),
    runningSinceSec: z.number().int().nonnegative().optional(),
  }),
);

export const ConfirmRetryRunCardSchema = envelope(
  "confirm_retry_run",
  z.object({
    runId: z.string(),
    agentName: z.string(),
    failureReason: z.string().optional(),
  }),
);

// ─── Confirm cards: cost-and-budget ─────────────────────

const BudgetPatchSchema = z.object({
  budgetLimitUsd: z.number().nullable().optional(),
  budgetSpentUsd: z.number().optional(),
  budgetPaused: z.boolean().optional(),
  autoPauseThreshold: z.number().int().min(0).max(100).nullable().optional(),
});

export const ConfirmSetBudgetCardSchema = envelope(
  "confirm_set_budget",
  z.object({
    scope: z.enum(["agent", "project"]),
    entityId: z.string(),
    current: BudgetPatchSchema,
    proposed: BudgetPatchSchema,
  }),
);

// ─── Confirm cards: memory ──────────────────────────────

const MemoryEntityPatchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  entityType: z.enum(["project", "area", "archive"]).optional(),
});

export const ConfirmUpdateMemoryEntityCardSchema = envelope(
  "confirm_update_memory_entity",
  z.object({
    entityId: z.string(),
    current: MemoryEntityPatchSchema,
    proposed: MemoryEntityPatchSchema,
  }),
);

export const ConfirmAddLessonCardSchema = envelope(
  "confirm_add_lesson",
  z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(20_000),
    tags: z.array(z.string()).optional(),
  }),
);

// ─── Info cards ─────────────────────────────────────────

export const InfoTaskListCardSchema = envelope(
  "info_task_list",
  z.object({
    tasks: z.array(TaskSummarySchema),
    groupedBy: z.enum(["column", "priority", "assignee"]).optional(),
  }),
);

export const InfoTaskDetailCardSchema = envelope(
  "info_task_detail",
  z.object({ task: TaskDetailSchema }),
);

export const InfoAgentListCardSchema = envelope(
  "info_agent_list",
  z.object({ agents: z.array(AgentSummarySchema) }),
);

export const InfoAgentDetailCardSchema = envelope(
  "info_agent_detail",
  z.object({ agent: AgentDetailSchema }),
);

export const InfoRunListCardSchema = envelope(
  "info_run_list",
  z.object({ runs: z.array(RunSummarySchema) }),
);

export const InfoRunDetailCardSchema = envelope(
  "info_run_detail",
  z.object({ run: RunDetailSchema }),
);

export const InfoCostSummaryCardSchema = envelope(
  "info_cost_summary",
  z.object({
    projectId: z.string(),
    period: z.enum(["day", "week", "month"]).optional(),
    totalSpentUsd: z.number(),
    byAgent: z.array(
      z.object({
        agentId: z.string(),
        name: z.string(),
        spentUsd: z.number(),
      }),
    ),
  }),
);

export const InfoBudgetStatusCardSchema = envelope(
  "info_budget_status",
  z.object({ entries: z.array(BudgetEntrySchema) }),
);

export const InfoPipelineListCardSchema = envelope(
  "info_pipeline_list",
  z.object({ pipelines: z.array(PipelineSummarySchema) }),
);

export const InfoPipelineRunHistoryCardSchema = envelope(
  "info_pipeline_run_history",
  z.object({
    pipelineId: z.string(),
    runs: z.array(PipelineRunSummarySchema),
  }),
);

export const InfoMemorySearchCardSchema = envelope(
  "info_memory_search",
  z.object({
    query: z.string(),
    results: z.array(MemorySearchResultSchema),
  }),
);

// ─── Result cards (success) ─────────────────────────────

const RESULT_KINDS = [
  "result_create_task",
  "result_update_task",
  "result_delete_task",
  "result_create_agent",
  "result_update_agent",
  "result_pause_agent",
  "result_resume_agent",
  "result_delete_agent",
  "result_create_pipeline",
  "result_update_pipeline",
  "result_run_pipeline",
  "result_delete_pipeline",
  "result_kill_run",
  "result_retry_run",
  "result_set_budget",
  "result_add_lesson",
  "result_update_memory_entity",
] as const;
export type ResultCardKind = (typeof RESULT_KINDS)[number];

// One schema per kind so the discriminated union has a unique literal
// per entry. The payload schema is identical (`ResultEntityPayloadSchema`).
export const ResultCreateTaskCardSchema     = envelope("result_create_task",     ResultEntityPayloadSchema);
export const ResultUpdateTaskCardSchema     = envelope("result_update_task",     ResultEntityPayloadSchema);
export const ResultDeleteTaskCardSchema     = envelope("result_delete_task",     ResultEntityPayloadSchema);
export const ResultCreateAgentCardSchema    = envelope("result_create_agent",    ResultEntityPayloadSchema);
export const ResultUpdateAgentCardSchema    = envelope("result_update_agent",    ResultEntityPayloadSchema);
export const ResultPauseAgentCardSchema     = envelope("result_pause_agent",     ResultEntityPayloadSchema);
export const ResultResumeAgentCardSchema    = envelope("result_resume_agent",    ResultEntityPayloadSchema);
export const ResultDeleteAgentCardSchema    = envelope("result_delete_agent",    ResultEntityPayloadSchema);
export const ResultCreatePipelineCardSchema = envelope("result_create_pipeline", ResultEntityPayloadSchema);
export const ResultUpdatePipelineCardSchema = envelope("result_update_pipeline", ResultEntityPayloadSchema);
export const ResultRunPipelineCardSchema    = envelope("result_run_pipeline",    ResultEntityPayloadSchema);
export const ResultDeletePipelineCardSchema = envelope("result_delete_pipeline", ResultEntityPayloadSchema);
export const ResultKillRunCardSchema        = envelope("result_kill_run",        ResultEntityPayloadSchema);
export const ResultRetryRunCardSchema       = envelope("result_retry_run",       ResultEntityPayloadSchema);
export const ResultSetBudgetCardSchema      = envelope("result_set_budget",      ResultEntityPayloadSchema);
export const ResultAddLessonCardSchema      = envelope("result_add_lesson",      ResultEntityPayloadSchema);
export const ResultUpdateMemoryEntityCardSchema = envelope("result_update_memory_entity", ResultEntityPayloadSchema);

// ─── Result cards (error) ───────────────────────────────

export const ResultErrorCardSchema = envelope(
  "result_error",
  z.object({
    reason: z.string(),
    httpStatus: z.number().int().optional(),
    endpoint: z.string().optional(),
    rawResponse: z.string().optional(),
  }),
);

// ─── Discriminated union of all card kinds ──────────────

export const ChatCardSchema = z.discriminatedUnion("kind", [
  // confirm: tasks
  ConfirmCreateTaskCardSchema,
  ConfirmUpdateTaskCardSchema,
  ConfirmAssignTaskCardSchema,
  ConfirmMoveTaskCardSchema,
  ConfirmConvertTaskCardSchema,
  ConfirmKillTaskCardSchema,
  ConfirmDeleteTaskCardSchema,
  // confirm: agents
  ConfirmCreateAgentCardSchema,
  ConfirmUpdateAgentCardSchema,
  ConfirmPauseAgentCardSchema,
  ConfirmResumeAgentCardSchema,
  ConfirmDeleteAgentCardSchema,
  // confirm: pipelines
  ConfirmCreatePipelineCardSchema,
  ConfirmUpdatePipelineCardSchema,
  ConfirmRunPipelineCardSchema,
  ConfirmDeletePipelineCardSchema,
  // confirm: runs
  ConfirmKillRunCardSchema,
  ConfirmRetryRunCardSchema,
  // confirm: cost / memory
  ConfirmSetBudgetCardSchema,
  ConfirmUpdateMemoryEntityCardSchema,
  ConfirmAddLessonCardSchema,
  // info
  InfoTaskListCardSchema,
  InfoTaskDetailCardSchema,
  InfoAgentListCardSchema,
  InfoAgentDetailCardSchema,
  InfoRunListCardSchema,
  InfoRunDetailCardSchema,
  InfoCostSummaryCardSchema,
  InfoBudgetStatusCardSchema,
  InfoPipelineListCardSchema,
  InfoPipelineRunHistoryCardSchema,
  InfoMemorySearchCardSchema,
  // result: success
  ResultCreateTaskCardSchema,
  ResultUpdateTaskCardSchema,
  ResultDeleteTaskCardSchema,
  ResultCreateAgentCardSchema,
  ResultUpdateAgentCardSchema,
  ResultPauseAgentCardSchema,
  ResultResumeAgentCardSchema,
  ResultDeleteAgentCardSchema,
  ResultCreatePipelineCardSchema,
  ResultUpdatePipelineCardSchema,
  ResultRunPipelineCardSchema,
  ResultDeletePipelineCardSchema,
  ResultKillRunCardSchema,
  ResultRetryRunCardSchema,
  ResultSetBudgetCardSchema,
  ResultAddLessonCardSchema,
  ResultUpdateMemoryEntityCardSchema,
  // result: error
  ResultErrorCardSchema,
]);

export type ChatCard = z.infer<typeof ChatCardSchema>;
export type ChatCardKind = ChatCard["kind"];

/**
 * Returns the array of all known card kinds at runtime. Useful for the
 * dashboard CardRegistry's exhaustive check and for fixture generation
 * in tests. Stays in sync with the union via type-level extraction.
 */
export const ALL_CARD_KINDS = [
  "confirm_create_task",
  "confirm_update_task",
  "confirm_assign_task",
  "confirm_move_task",
  "confirm_convert_task",
  "confirm_kill_task",
  "confirm_delete_task",
  "confirm_create_agent",
  "confirm_update_agent",
  "confirm_pause_agent",
  "confirm_resume_agent",
  "confirm_delete_agent",
  "confirm_create_pipeline",
  "confirm_update_pipeline",
  "confirm_run_pipeline",
  "confirm_delete_pipeline",
  "confirm_kill_run",
  "confirm_retry_run",
  "confirm_set_budget",
  "confirm_update_memory_entity",
  "confirm_add_lesson",
  "info_task_list",
  "info_task_detail",
  "info_agent_list",
  "info_agent_detail",
  "info_run_list",
  "info_run_detail",
  "info_cost_summary",
  "info_budget_status",
  "info_pipeline_list",
  "info_pipeline_run_history",
  "info_memory_search",
  "result_create_task",
  "result_update_task",
  "result_delete_task",
  "result_create_agent",
  "result_update_agent",
  "result_pause_agent",
  "result_resume_agent",
  "result_delete_agent",
  "result_create_pipeline",
  "result_update_pipeline",
  "result_run_pipeline",
  "result_delete_pipeline",
  "result_kill_run",
  "result_retry_run",
  "result_set_budget",
  "result_add_lesson",
  "result_update_memory_entity",
  "result_error",
] as const satisfies readonly ChatCardKind[];

/**
 * Type-level guard: every kind in the discriminated union appears in
 * ALL_CARD_KINDS, and vice versa. If anyone adds a new schema entry to
 * the union but forgets ALL_CARD_KINDS (or vice versa) the `_exhaustive`
 * assignment below fails to compile.
 *
 * Direction 1 (kinds missing from ALL_CARD_KINDS) is caught by this
 * assertion collapsing to `never` when the `Exclude<>` is non-empty.
 * Direction 2 (extras in ALL_CARD_KINDS not in the union) is ALSO caught
 * by the `satisfies readonly ChatCardKind[]` clause on the array above.
 */
type _ExhaustiveCheck =
  (Exclude<ChatCardKind, (typeof ALL_CARD_KINDS)[number]> extends never ? true : false) &
  (Exclude<(typeof ALL_CARD_KINDS)[number], ChatCardKind> extends never ? true : false);
const _exhaustive: _ExhaustiveCheck = true;
