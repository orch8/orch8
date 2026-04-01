import { z } from "zod";

export const TaskTypeSchema = z.enum(["quick", "complex", "brainstorm"]);
export const TaskColumnSchema = z.enum([
  "backlog", "blocked", "in_progress", "done",
]);
export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export const ComplexPhaseSchema = z.enum(["research", "plan", "implement", "review"]);
export const BrainstormStatusSchema = z.enum(["active", "idle", "ready", "expired"]);

const taskBase = {
  title: z.string().min(1).max(500),
  description: z.string().max(10000).default(""),
  projectId: z.string().min(1),
  priority: TaskPrioritySchema.default("medium"),
  assignee: z.string().optional(),
};

export const CreateQuickTaskSchema = z.object({
  ...taskBase,
  taskType: z.literal("quick"),
});

export const CreateComplexTaskSchema = z.object({
  ...taskBase,
  taskType: z.literal("complex"),
  researchAgentId: z.string().optional(),
  planAgentId: z.string().optional(),
  implementAgentId: z.string().optional(),
  reviewAgentId: z.string().optional(),
  researchPromptOverride: z.string().optional(),
  planPromptOverride: z.string().optional(),
  implementPromptOverride: z.string().optional(),
  reviewPromptOverride: z.string().optional(),
});

export const CreateBrainstormTaskSchema = z.object({
  ...taskBase,
  taskType: z.literal("brainstorm"),
});

export const CreateTaskSchema = z.discriminatedUnion("taskType", [
  CreateQuickTaskSchema,
  CreateComplexTaskSchema,
  CreateBrainstormTaskSchema,
]);

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  column: TaskColumnSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assignee: z.string().nullable().optional(),
  researchAgentId: z.string().nullable().optional(),
  planAgentId: z.string().nullable().optional(),
  implementAgentId: z.string().nullable().optional(),
  reviewAgentId: z.string().nullable().optional(),
  autoCommit: z.boolean().optional(),
  autoPr: z.boolean().optional(),
  branch: z.string().nullable().optional(),
  worktreePath: z.string().nullable().optional(),
  mcpTools: z.array(z.string()).optional(),
  researchPromptOverride: z.string().nullable().optional(),
  planPromptOverride: z.string().nullable().optional(),
  implementPromptOverride: z.string().nullable().optional(),
  reviewPromptOverride: z.string().nullable().optional(),
});

export const CompletePhaseSchema = z.object({
  output: z.string().min(1),
});

export const ConvertTaskSchema = z.object({
  taskType: z.enum(["quick", "complex"]),
});

export const TaskFilterSchema = z.object({
  projectId: z.string().optional(),
  column: TaskColumnSchema.optional(),
  taskType: TaskTypeSchema.optional(),
  assignee: z.string().optional(),
  complexPhase: ComplexPhaseSchema.optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type CompletePhase = z.infer<typeof CompletePhaseSchema>;
export type ConvertTask = z.infer<typeof ConvertTaskSchema>;
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
