import { z } from "zod";

export const orchestratorSectionSchema = z.object({
  tick_interval_ms: z.number().int().positive().default(5000),
  log_level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
}).default({});

export const apiSectionSchema = z.object({
  port: z.number().int().positive().default(3847),
  host: z.string().default("localhost"),
}).default({});

export const databaseSectionSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().positive().default(5433),
  name: z.string().default("orchestrator"),
  user: z.string().default("orchestrator"),
  password_env: z.string().default("ORCH_DB_PASSWORD"),
  pool_min: z.number().int().nonnegative().default(2),
  pool_max: z.number().int().positive().default(10),
  auto_migrate: z.boolean().default(true),
}).default({});

export const defaultsSectionSchema = z.object({
  model: z.string().default("claude-opus-4-6"),
  max_turns: z.number().int().positive().default(25),
  auto_commit: z.boolean().default(false),
  auto_pr: z.boolean().default(true),
  verification_required: z.boolean().default(true),
  brainstorm_idle_timeout_min: z.number().int().nonnegative().default(30),
}).default({});

export const limitsSectionSchema = z.object({
  max_concurrent_agents: z.number().int().positive().default(5),
  max_concurrent_per_project: z.number().int().positive().default(3),
  max_spawns_per_hour: z.number().int().positive().default(20),
  cooldown_on_failure: z.number().int().nonnegative().default(300),
}).default({});

export const memorySectionSchema = z.object({
  extraction_on_session_end: z.boolean().default(true),
  summary_rewrite_schedule: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  fact_decay_days: z.number().int().positive().default(90),
  max_entries_before_curation: z.number().int().positive().default(50),
}).default({});

export const orphanDetectionSectionSchema = z.object({
  staleness_threshold_sec: z.number().int().positive().default(300),
  max_process_loss_retries: z.number().int().nonnegative().default(1),
}).default({});

export const globalConfigSchema = z.object({
  orchestrator: orchestratorSectionSchema,
  api: apiSectionSchema,
  database: databaseSectionSchema,
  defaults: defaultsSectionSchema,
  limits: limitsSectionSchema,
  memory: memorySectionSchema,
  orphan_detection: orphanDetectionSectionSchema,
}).default({});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;

// ─── Project Config ──────────────────────────────────────

export const projectSectionSchema = z.object({
  name: z.string().optional(),
  default_branch: z.string().default("main"),
}).optional();

export const budgetSectionSchema = z.object({
  limit_usd: z.number().nonnegative().optional(),
}).optional();

export const projectConfigSchema = z.object({
  project: projectSectionSchema,
  defaults: defaultsSectionSchema.removeDefault().partial().optional(),
  limits: z.object({
    max_concurrent_per_project: z.number().int().positive().optional(),
  }).optional(),
  budget: budgetSectionSchema,
}).default({});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

// ─── Config Merging ──────────────────────────────────────

export type MergedConfig = GlobalConfig;

export function mergeConfigs(
  global: GlobalConfig,
  project: ProjectConfig | null,
): MergedConfig {
  if (!project) return global;

  return {
    ...global,
    defaults: {
      ...global.defaults,
      ...(project.defaults ?? {}),
    },
    limits: {
      ...global.limits,
      ...(project.limits ?? {}),
    },
  };
}
