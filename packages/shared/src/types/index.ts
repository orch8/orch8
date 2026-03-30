import type { z } from "zod";
import type { HealthStatusSchema } from "../schemas/index.js";

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
