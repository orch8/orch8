import { randomUUID } from "node:crypto";
import {
  pgTable, pgEnum, text, boolean, integer, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./schema.js";

// ─── Pipeline Enums ─────────────────────────────────────

export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "pending", "running", "completed", "failed", "cancelled",
]);

export const pipelineStepStatusEnum = pgEnum("pipeline_step_status", [
  "pending", "running", "completed", "skipped", "failed", "awaiting_verification",
]);

// ─── Pipeline Templates ─────────────────────────────────

export const pipelineTemplates = pgTable("pipeline_templates", {
  id: text("id").primaryKey().$defaultFn(() => `ptpl_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default(""),
  isDefault: boolean("is_default").notNull().default(false),
  steps: jsonb("steps").notNull().$type<Array<{
    order: number;
    label: string;
    defaultAgentId?: string;
    promptTemplate?: string;
    requiresVerification?: boolean;
  }>>(),
  createdBy: text("created_by").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Pipelines ──────────────────────────────────────────

export const pipelines = pgTable("pipelines", {
  id: text("id").primaryKey().$defaultFn(() => `pipe_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  templateId: text("template_id").references(() => pipelineTemplates.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  status: pipelineStatusEnum("status").notNull().default("pending"),
  currentStep: integer("current_step").notNull().default(1),
  createdBy: text("created_by").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pipelines_project_id_idx").on(table.projectId),
]);

// ─── Pipeline Steps ─────────────────────────────────────

export const pipelineSteps = pgTable("pipeline_steps", {
  id: text("id").primaryKey().$defaultFn(() => `pstep_${randomUUID()}`),
  pipelineId: text("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  label: text("label").notNull(),
  taskId: text("task_id"), // FK to tasks — defined in migration SQL to avoid circular imports
  agentId: text("agent_id"), // No FK: agents use composite PK (id, projectId)
  promptOverride: text("prompt_override"),
  requiresVerification: boolean("requires_verification").notNull().default(false),
  outputFilePath: text("output_file_path"),
  outputSummary: text("output_summary"),
  approvedBranch: text("approved_branch"),
  approvedCommit: text("approved_commit"),
  status: pipelineStepStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("pipeline_steps_pipeline_id_idx").on(table.pipelineId),
  uniqueIndex("pipeline_steps_pipeline_order_idx").on(table.pipelineId, table.order),
  index("pipeline_steps_task_id_idx").on(table.taskId),
]);

// Operator-triggered repository execution; separate from agent runs and review.
export const pipelineTestRuns = pgTable("pipeline_test_runs", {
  id: text("id").primaryKey().$defaultFn(() => `ptest_${randomUUID()}`),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  pipelineId: text("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
  repository: text("repository").notNull(),
  triggeredBy: text("triggered_by").notNull().default("operator"),
  result: jsonb("result").notNull().$type<{
    command: string[]; script: string; exitCode: number | null; signal: string | null;
    timedOut: boolean; outputTruncated: boolean; stdout: string; stderr: string;
    revisionBefore: { branch: string | null; commit: string | null; workingTree: "clean" | "dirty" | "unavailable" };
    revisionAfter: { branch: string | null; commit: string | null; workingTree: "clean" | "dirty" | "unavailable" };
    checkoutChanged: boolean;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("pipeline_test_runs_latest_idx").on(table.pipelineId, table.createdAt)]);
