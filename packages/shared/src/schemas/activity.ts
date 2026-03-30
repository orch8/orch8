import { z } from "zod";

export const LogLevelSchema = z.enum(["info", "warn", "error"]);

export const CreateLogEntrySchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  runId: z.string().optional(),
  message: z.string().min(1).max(5000),
  level: LogLevelSchema.default("info"),
});

export const LogFilterSchema = z.object({
  projectId: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  level: LogLevelSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
