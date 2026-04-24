import { z } from "zod";

export const ErrorSeveritySchema = z.enum(["warn", "error", "fatal"]);

export const ErrorSourceSchema = z.enum([
  "daemon",
  "api",
  "ws",
  "agent",
  "provider",
  "tool",
  "heartbeat",
  "chat",
  "memory",
  "budget",
  "pipeline",
  "scheduler",
  "adapter",
  "db",
  "fs",
  "config",
]);

export const ErrorLogSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  agentId: z.string().nullable(),
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  chatId: z.string().nullable(),
  requestId: z.string().nullable(),
  severity: ErrorSeveritySchema,
  source: ErrorSourceSchema,
  code: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  cause: z.unknown().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  httpMethod: z.string().nullable(),
  httpPath: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  actorType: z.string().nullable(),
  actorId: z.string().nullable(),
  fingerprint: z.string(),
  occurrences: z.number().int(),
  firstSeenAt: z.coerce.date(),
  lastSeenAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable(),
  resolvedBy: z.string().nullable(),
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export const ErrorLogFilterSchema = z.object({
  projectId: z.string().optional(),
  severity: ErrorSeveritySchema.optional(),
  source: ErrorSourceSchema.optional(),
  code: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  runId: z.string().optional(),
  chatId: z.string().optional(),
  requestId: z.string().optional(),
  unresolvedOnly: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const ResolveErrorLogSchema = z.object({
  resolvedBy: z.string().min(1).max(200),
});

export const CreateClientErrorLogSchema = z.object({
  projectId: z.string().optional(),
  agentId: z.string().optional(),
  taskId: z.string().optional(),
  runId: z.string().optional(),
  chatId: z.string().optional(),
  requestId: z.string().optional(),
  code: z.string().min(1).max(160),
  message: z.string().min(1).max(2048),
  metadata: z.record(z.unknown()).optional(),
  httpMethod: z.string().max(20).optional(),
  httpPath: z.string().max(2048).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
});

export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;
export type ErrorSource = z.infer<typeof ErrorSourceSchema>;
export type ErrorLog = z.infer<typeof ErrorLogSchema>;
export type ErrorLogFilter = z.infer<typeof ErrorLogFilterSchema>;
export type ResolveErrorLog = z.infer<typeof ResolveErrorLogSchema>;
export type CreateClientErrorLog = z.infer<typeof CreateClientErrorLogSchema>;
