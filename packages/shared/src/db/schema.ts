import { randomUUID } from "node:crypto";
import {
  pgTable, pgEnum, text, boolean, integer, timestamp, real,
  jsonb, primaryKey, check, uniqueIndex, index, type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────

export const taskColumnEnum = pgEnum("task_column", [
  "backlog", "blocked", "in_progress", "done",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "quick", "complex", "brainstorm",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "high", "medium", "low",
]);

export const complexPhaseEnum = pgEnum("complex_phase", [
  "research", "plan", "implement", "review",
]);

export const commentTypeEnum = pgEnum("comment_type", [
  "inline", "system", "verification", "brainstorm",
]);

export const agentRoleEnum = pgEnum("agent_role", [
  "cto", "engineer", "qa", "researcher", "planner",
  "implementer", "reviewer", "verifier", "referee", "custom",
]);

export const factCategoryEnum = pgEnum("fact_category", [
  "decision", "status", "milestone", "issue",
  "relationship", "convention", "observation",
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "project", "area", "archive",
]);

export const logLevelEnum = pgEnum("log_level", [
  "info", "warn", "error",
]);

export const processStatusEnum = pgEnum("process_status", [
  "running", "completed", "failed", "crashed",
]);

export const runStatusEnum = pgEnum("run_status", [
  "queued", "running", "succeeded", "failed", "timed_out", "cancelled",
]);

export const wakeupSourceEnum = pgEnum("wakeup_source", [
  "timer", "assignment", "on_demand", "automation",
]);

export const wakeupStatusEnum = pgEnum("wakeup_status", [
  "queued", "claimed", "coalesced", "deferred_issue_execution",
  "skipped", "budget_blocked",
]);

export const agentStatusEnum = pgEnum("agent_status", [
  "active", "paused", "terminated",
]);

export const brainstormStatusEnum = pgEnum("brainstorm_status", [
  "active", "idle", "ready", "expired",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "budget_warning",
  "budget_exceeded",
  "agent_failure",
  "brainstorm_ready",
  "task_completed",
  "stuck_task",
]);

// ─── Projects ─────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: text("id").primaryKey().$defaultFn(() => `proj_${randomUUID()}`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default(""),

  homeDir: text("home_dir").notNull(),
  worktreeDir: text("worktree_dir").notNull(),

  repoUrl: text("repo_url"),
  defaultBranch: text("default_branch").notNull().default("main"),

  defaultModel: text("default_model"),
  defaultMaxTurns: integer("default_max_turns"),

  budgetLimitUsd: real("budget_limit_usd"),
  budgetSpentUsd: real("budget_spent_usd").notNull().default(0),
  budgetPaused: boolean("budget_paused").notNull().default(false),

  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Agents ───────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: text("id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: agentRoleEnum("role").notNull().default("custom"),
  status: agentStatusEnum("status").notNull().default("active"),
  icon: text("icon").default("🤖"),
  color: text("color").default("#888780"),

  model: text("model").notNull().default("claude-opus-4-6"),
  effort: text("effort"),
  maxTurns: integer("max_turns").notNull().default(25),
  allowedTools: text("allowed_tools").array().default(sql`'{}'`),

  heartbeatEnabled: boolean("heartbeat_enabled").notNull().default(false),
  heartbeatIntervalSec: integer("heartbeat_interval_sec").notNull().default(0),

  // Session compaction config
  sessionCompactionEnabled: boolean("session_compaction_enabled").default(false),
  sessionMaxRuns: integer("session_max_runs"),
  sessionMaxInputTokens: integer("session_max_input_tokens"),
  sessionMaxAgeHours: integer("session_max_age_hours"),

  wakeOnAssignment: boolean("wake_on_assignment").notNull().default(true),
  wakeOnOnDemand: boolean("wake_on_on_demand").notNull().default(true),
  wakeOnAutomation: boolean("wake_on_automation").notNull().default(true),
  maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(1),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),

  canAssignTo: text("can_assign_to").array().default(sql`'{}'`),
  canCreateTasks: boolean("can_create_tasks").default(false),
  canMoveTo: taskColumnEnum("can_move_to").array().default(sql`'{}'`),

  systemPrompt: text("system_prompt").default(""),
  promptTemplate: text("prompt_template").default(""),
  bootstrapPromptTemplate: text("bootstrap_prompt_template").default(""),
  instructionsFilePath: text("instructions_file_path"),

  researchPrompt: text("research_prompt").default(""),
  planPrompt: text("plan_prompt").default(""),
  implementPrompt: text("implement_prompt").default(""),
  reviewPrompt: text("review_prompt").default(""),

  mcpTools: text("mcp_tools").array().default(sql`'{}'`),
  skillPaths: text("skill_paths").array().default(sql`'{}'`),
  desiredSkills: text("desired_skills").array(),

  workLogDir: text("work_log_dir"),
  lessonsFile: text("lessons_file"),

  adapterType: text("adapter_type").notNull().default("claude_local"),
  adapterConfig: jsonb("adapter_config").default({}),

  maxConcurrentTasks: integer("max_concurrent_tasks").default(1),
  maxConcurrentSubagents: integer("max_concurrent_subagents").default(3),
  workingHours: text("working_hours"),

  autoPauseThreshold: integer("auto_pause_threshold"),

  budgetLimitUsd: real("budget_limit_usd"),
  budgetSpentUsd: real("budget_spent_usd").notNull().default(0),
  budgetPaused: boolean("budget_paused").notNull().default(false),
  pauseReason: text("pause_reason"),

  envVars: jsonb("env_vars").default({}),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.id, table.projectId] }),
]);

// ─── Tasks ────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey().$defaultFn(() => `task_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").default(""),
  column: taskColumnEnum("column").notNull().default("backlog"),
  taskType: taskTypeEnum("task_type").notNull().default("quick"),
  assignee: text("assignee"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),

  // Complex task phases
  complexPhase: complexPhaseEnum("complex_phase"),
  researchOutput: text("research_output"),
  planOutput: text("plan_output"),
  implementationOutput: text("implementation_output"),
  reviewOutput: text("review_output"),

  researchAgentId: text("research_agent_id"),
  planAgentId: text("plan_agent_id"),
  implementAgentId: text("implement_agent_id"),
  reviewAgentId: text("review_agent_id"),

  researchPromptOverride: text("research_prompt_override"),
  planPromptOverride: text("plan_prompt_override"),
  implementPromptOverride: text("implement_prompt_override"),
  reviewPromptOverride: text("review_prompt_override"),

  // Brainstorm
  brainstormStatus: brainstormStatusEnum("brainstorm_status"),
  brainstormTranscript: text("brainstorm_transcript"),
  brainstormSessionPid: integer("brainstorm_session_pid"),

  // Git
  autoCommit: boolean("auto_commit").notNull().default(false),
  autoPr: boolean("auto_pr").notNull().default(true),
  branch: text("branch"),
  worktreePath: text("worktree_path"),

  // Execution locking
  executionRunId: text("execution_run_id"),
  executionAgentId: text("execution_agent_id"),
  executionLockedAt: timestamp("execution_locked_at", { withTimezone: true }),

  mcpTools: text("mcp_tools").array().default(sql`'{}'`),
  retryCount: integer("retry_count").notNull().default(0),
  linkedIssueIds: text("linked_issue_ids").array(),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Task Dependencies ────────────────────────────────────

export const taskDependencies = pgTable("task_dependencies", {
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnId: text("depends_on_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.taskId, table.dependsOnId] }),
  check("no_self_dep", sql`${table.taskId} != ${table.dependsOnId}`),
]);

// ─── Comments ─────────────────────────────────────────────

export const comments = pgTable("comments", {
  id: text("id").primaryKey().$defaultFn(() => `cmt_${randomUUID()}`),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  author: text("author").notNull(),
  body: text("body").notNull(),
  type: commentTypeEnum("type").notNull().default("inline"),
  lineRef: text("line_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Heartbeat Runs ──────────────────────────────────────

export const heartbeatRuns = pgTable("heartbeat_runs", {
  id: text("id").primaryKey().$defaultFn(() => `run_${randomUUID()}`),
  agentId: text("agent_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),

  invocationSource: wakeupSourceEnum("invocation_source").notNull(),
  triggerDetail: text("trigger_detail"),

  status: runStatusEnum("status").notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),

  processPid: integer("process_pid"),
  processStartedAt: timestamp("process_started_at", { withTimezone: true }),
  exitCode: integer("exit_code"),
  signal: text("signal"),

  error: text("error"),
  errorCode: text("error_code"),
  usageJson: jsonb("usage_json"),
  resultJson: jsonb("result_json"),
  costUsd: real("cost_usd"),
  billingType: text("billing_type"),
  model: text("model"),

  sessionIdBefore: text("session_id_before"),
  sessionIdAfter: text("session_id_after"),

  logStore: text("log_store"),
  logRef: text("log_ref"),
  logBytes: integer("log_bytes"),

  contextSnapshot: jsonb("context_snapshot"),

  parentRunId: text("parent_run_id").references((): AnyPgColumn => heartbeatRuns.id, { onDelete: "set null" }),

  retryOfRunId: text("retry_of_run_id"),
  processLossRetryCount: integer("process_loss_retry_count").notNull().default(0),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Run Events ─────────────────────────────────────────
export const runEvents = pgTable(
  "run_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => `evt_${randomUUID()}`),
    runId: text("run_id")
      .notNull()
      .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    eventType: text("event_type").notNull(),
    toolName: text("tool_name"),
    summary: text("summary").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("run_events_run_id_seq_idx").on(table.runId, table.seq),
  ],
);

// ─── Wakeup Requests ─────────────────────────────────────

export const wakeupRequests = pgTable("wakeup_requests", {
  id: text("id").primaryKey().$defaultFn(() => `wake_${randomUUID()}`),
  agentId: text("agent_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),

  source: wakeupSourceEnum("source").notNull(),
  triggerDetail: text("trigger_detail"),
  reason: text("reason"),
  commentId: text("comment_id"),
  payload: jsonb("payload"),

  status: wakeupStatusEnum("status").notNull().default("queued"),
  coalescedCount: integer("coalesced_count").notNull().default(0),
  idempotencyKey: text("idempotency_key"),

  requestedByActorType: text("requested_by_actor_type"),
  requestedByActorId: text("requested_by_actor_id"),

  runId: text("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Task Sessions ───────────────────────────────────────

export const taskSessions = pgTable("task_sessions", {
  id: text("id").primaryKey().$defaultFn(() => `sess_${randomUUID()}`),
  agentId: text("agent_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  taskKey: text("task_key").notNull(),
  adapterType: text("adapter_type").notNull(),

  sessionParamsJson: jsonb("session_params_json"),
  sessionDisplayId: text("session_display_id"),
  lastRunId: text("last_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uniq_task_session").on(table.agentId, table.taskKey, table.adapterType),
]);

// ─── Knowledge Graph Entities ─────────────────────────────

export const knowledgeEntities = pgTable("knowledge_entities", {
  id: text("id").primaryKey().$defaultFn(() => `ent_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  entityType: entityTypeEnum("entity_type").notNull().default("area"),
  description: text("description").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uniq_entity_project_slug").on(table.projectId, table.slug),
]);

// ─── Knowledge Graph Facts ────────────────────────────────

export const knowledgeFacts = pgTable("knowledge_facts", {
  id: text("id").primaryKey().$defaultFn(() => `fact_${randomUUID()}`),
  entityId: text("entity_id").notNull().references(() => knowledgeEntities.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: factCategoryEnum("category").notNull(),
  sourceAgent: text("source_agent").notNull(),
  sourceTask: text("source_task").references(() => tasks.id, { onDelete: "set null" }),

  supersededBy: text("superseded_by"),
  accessCount: integer("access_count").notNull().default(0),
  lastAccessed: timestamp("last_accessed", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Shared Decisions ─────────────────────────────────────

export const sharedDecisions = pgTable("shared_decisions", {
  id: text("id").primaryKey().$defaultFn(() => `dec_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  decision: text("decision").notNull(),
  madeBy: text("made_by").notNull(),
  context: text("context").default(""),
  binding: boolean("binding").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Activity Log ─────────────────────────────────────────

export const activityLog = pgTable("activity_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  agentId: text("agent_id"),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  runId: text("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  level: logLevelEnum("level").notNull().default("info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── MCP Tool Registry (global) ───────────────────────────

export const mcpTools = pgTable("mcp_tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  serverCommand: text("server_command").notNull(),
  serverArgs: text("server_args").array().default(sql`'{}'`),
  envVars: jsonb("env_vars").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Notifications ───────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => `ntf_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Project Skills ─────────────────────────────────────

export const projectSkills = pgTable("project_skills", {
  id: text("id").primaryKey().$defaultFn(() => `skill_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  markdown: text("markdown").notNull(),
  sourceType: text("source_type").notNull().default("local_path"),
  sourceLocator: text("source_locator"),
  trustLevel: text("trust_level").notNull().default("markdown_only"),
  fileInventory: jsonb("file_inventory").notNull().default([]),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("project_skills_project_slug_idx").on(table.projectId, table.slug),
]);

// ─── Instruction Bundles ────────────────────────────────

export const instructionBundles = pgTable("instruction_bundles", {
  id: text("id").primaryKey().$defaultFn(() => `ibun_${randomUUID()}`),
  agentId: text("agent_id").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id),
  mode: text("mode").notNull().default("managed"),
  rootPath: text("root_path").notNull(),
  entryFile: text("entry_file").notNull().default("AGENTS.md"),
  fileInventory: jsonb("file_inventory").notNull().default([]),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("instruction_bundles_agent_project_idx").on(table.agentId, table.projectId),
]);
