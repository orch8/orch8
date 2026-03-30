import { z } from "zod";

export const FactCategorySchema = z.enum([
  "decision", "status", "milestone", "issue",
  "relationship", "convention", "observation",
]);

export const EntityTypeSchema = z.enum(["project", "area", "archive"]);

export const CreateEntitySchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(200),
  entityType: EntityTypeSchema.default("area"),
  description: z.string().max(5000).optional(),
});

export const CreateFactSchema = z.object({
  content: z.string().min(1).max(10000),
  category: FactCategorySchema,
  sourceTask: z.string().optional(),
});

export const EntityFilterSchema = z.object({
  projectId: z.string().optional(),
  entityType: EntityTypeSchema.optional(),
});

export const KnowledgeSearchSchema = z.object({
  query: z.string().min(1),
  projectId: z.string().optional(),
});

export const WorklogEntrySchema = z.object({
  content: z.string().min(1).max(50000),
});

export const LessonEntrySchema = z.object({
  content: z.string().min(1).max(10000),
});
