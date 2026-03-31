import { z } from "zod";

export const DaemonLogFilterSchema = z.object({
  limit: z.coerce.number().int().positive().default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
  level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
});

export const DaemonConfigPatchSchema = z.object({
  orchestrator: z.object({
    tick_interval_ms: z.number().int().positive().optional(),
    log_level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).optional(),
  }).optional(),
  defaults: z.object({
    model: z.string().optional(),
    max_turns: z.number().int().positive().optional(),
    auto_commit: z.boolean().optional(),
    auto_pr: z.boolean().optional(),
    verification_required: z.boolean().optional(),
    brainstorm_idle_timeout_min: z.number().int().nonnegative().optional(),
  }).optional(),
  limits: z.object({
    max_concurrent_agents: z.number().int().positive().optional(),
    max_concurrent_per_project: z.number().int().positive().optional(),
    max_spawns_per_hour: z.number().int().positive().optional(),
    cooldown_on_failure: z.number().int().nonnegative().optional(),
  }).optional(),
  memory: z.object({
    extraction_on_session_end: z.boolean().optional(),
    summary_rewrite_schedule: z.enum(["daily", "weekly", "monthly"]).optional(),
    fact_decay_days: z.number().int().positive().optional(),
  }).optional(),
  restart: z.boolean().optional(),
});

export type DaemonLogFilter = z.infer<typeof DaemonLogFilterSchema>;
export type DaemonConfigPatch = z.infer<typeof DaemonConfigPatchSchema>;
