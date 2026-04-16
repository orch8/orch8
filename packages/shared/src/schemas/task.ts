import { z } from "zod";

export const TaskTypeSchema = z.enum(["quick", "brainstorm"]);
export const TaskColumnSchema = z.enum([
  "backlog", "blocked", "in_progress", "done",
]);
export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export const BrainstormStatusSchema = z.enum(["active", "idle", "ready", "expired"]);

const taskBase = {
  title: z.string().min(1).max(500),
  description: z.string().max(10000).default(""),
  projectId: z.string().min(1),
  priority: TaskPrioritySchema.default("medium"),
  assignee: z.string().optional(),
  dependsOn: z.array(z.string().min(1)).optional(),
};

export const CreateQuickTaskSchema = z.object({
  ...taskBase,
  taskType: z.literal("quick"),
});

export const CreateBrainstormTaskSchema = z.object({
  ...taskBase,
  taskType: z.literal("brainstorm"),
});

export const CreateTaskSchema = z.discriminatedUnion("taskType", [
  CreateQuickTaskSchema,
  CreateBrainstormTaskSchema,
]);

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  column: TaskColumnSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assignee: z.string().nullable().optional(),
  autoCommit: z.boolean().optional(),
  autoPr: z.boolean().optional(),
  finishStrategy: z.enum(["pr", "merge", "none"]).nullable().optional(),
  mcpTools: z.array(z.string()).optional(),
});

export const ConvertTaskSchema = z.object({
  taskType: z.literal("quick"),
});

export const TaskFilterSchema = z.object({
  projectId: z.string().optional(),
  column: TaskColumnSchema.optional(),
  taskType: TaskTypeSchema.optional(),
  assignee: z.string().optional(),
  pipelineId: z.string().optional(),
});

export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type ConvertTask = z.infer<typeof ConvertTaskSchema>;
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
