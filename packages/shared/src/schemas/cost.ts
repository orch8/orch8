import { z } from "zod";

export const CostSummaryQuerySchema = z.object({
  projectId: z.string().optional(),
  agentId: z.string().optional(),
});

export const CostTimeseriesQuerySchema = z.object({
  projectId: z.string().min(1),
  days: z.coerce.number().int().min(1).max(90).default(7),
});
