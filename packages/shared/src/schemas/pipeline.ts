import { z } from "zod";

// ─── Pipeline Templates ─────────────────────────────────

const StepDefinitionSchema = z.object({
  order: z.number().int().min(1),
  label: z.string().min(1).max(100),
  defaultAgentId: z.string().optional(),
  promptTemplate: z.string().optional(),
  requiresVerification: z.boolean().optional(),
});

export const CreatePipelineTemplateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  isDefault: z.boolean().default(false),
  steps: z.array(StepDefinitionSchema).min(1),
});

export const UpdatePipelineTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
  steps: z.array(StepDefinitionSchema).min(1).optional(),
});

export const PipelineTemplateFilterSchema = z.object({
  projectId: z.string().optional(),
});

// ─── Pipelines ──────────────────────────────────────────

const PipelineStepInputSchema = z.object({
  label: z.string().min(1).max(100),
  agentId: z.string().optional(),
  promptOverride: z.string().optional(),
  requiresVerification: z.boolean().optional(),
});

export const CreatePipelineSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(500),
  templateId: z.string().optional(),
  steps: z.array(PipelineStepInputSchema).min(1).optional(),
  createdBy: z.string().default("user"),
});

export const PipelineFilterSchema = z.object({
  projectId: z.string().optional(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
});

// ─── Pipeline Steps ─────────────────────────────────────

export const UpdatePipelineStepSchema = z.object({
  agentId: z.string().nullable().optional(),
  promptOverride: z.string().nullable().optional(),
  status: z.enum(["skipped"]).optional(),
  requiresVerification: z.boolean().optional(),
});

export const CompletePipelineStepSchema = z.object({
  output: z.string().min(1).max(50000),
});

export const RejectPipelineStepSchema = z.object({
  targetStepId: z.string().min(1),
  feedback: z.string().min(1).max(5000),
});

// ─── Types ──────────────────────────────────────────────

export type CreatePipelineTemplate = z.infer<typeof CreatePipelineTemplateSchema>;
export type UpdatePipelineTemplate = z.infer<typeof UpdatePipelineTemplateSchema>;
export type PipelineTemplateFilter = z.infer<typeof PipelineTemplateFilterSchema>;
export type CreatePipeline = z.infer<typeof CreatePipelineSchema>;
export type PipelineFilter = z.infer<typeof PipelineFilterSchema>;
export type UpdatePipelineStep = z.infer<typeof UpdatePipelineStepSchema>;
export type CompletePipelineStep = z.infer<typeof CompletePipelineStepSchema>;
export type RejectPipelineStep = z.infer<typeof RejectPipelineStepSchema>;
