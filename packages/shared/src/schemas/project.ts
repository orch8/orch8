import { z } from "zod";

export const FinishStrategySchema = z.enum(["pr", "merge", "none"]);
export const ProjectKeySchema = z.string().regex(/^[A-Z][A-Z0-9]{1,4}$/);

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  key: ProjectKeySchema.optional(),
  description: z.string().max(5000).default(""),
  homeDir: z.string().min(1),
  repoUrl: z.string().optional(),
  defaultBranch: z.string().default("main"),
  defaultModel: z.string().optional(),
  defaultMaxTurns: z.number().int().min(1).optional(),
  budgetLimitUsd: z.number().min(0).optional(),
  finishStrategy: FinishStrategySchema.default("merge"),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  repoUrl: z.string().nullable().optional(),
  defaultBranch: z.string().optional(),
  defaultModel: z.string().nullable().optional(),
  defaultMaxTurns: z.number().int().min(1).nullable().optional(),
  budgetLimitUsd: z.number().min(0).nullable().optional(),
  finishStrategy: FinishStrategySchema.optional(),
  active: z.boolean().optional(),
});

export const ProjectFilterSchema = z.object({
  active: z.coerce.boolean().optional(),
});
