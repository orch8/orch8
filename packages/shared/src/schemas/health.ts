import { z } from "zod";

export const HealthStatusSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  version: z.string(),
  uptime: z.number().nonnegative(),
});
