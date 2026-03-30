import { z } from "zod";

export const FactCategorySchema = z.enum([
  "decision", "status", "milestone", "issue",
  "relationship", "convention", "observation",
]);

export const EntityTypeSchema = z.enum(["project", "area", "archive"]);

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
