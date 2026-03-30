import type { z } from "zod";
import type { HealthStatusSchema } from "../schemas/index.js";
import type {
  CreateTaskSchema,
  UpdateTaskSchema,
  CompletePhaseSchema,
  ConvertTaskSchema,
  TaskFilterSchema,
} from "../schemas/index.js";

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type CompletePhase = z.infer<typeof CompletePhaseSchema>;
export type ConvertTask = z.infer<typeof ConvertTaskSchema>;
export type TaskFilter = z.infer<typeof TaskFilterSchema>;
