import { describe, it, expect } from "vitest";
import { globalConfigSchema, projectConfigSchema, mergeConfigs } from "../config/schema.js";
import { loadGlobalConfig, loadProjectConfig } from "../config/loader.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("globalConfigSchema", () => {
  it("accepts a full valid config", () => {
    const input = {
      orchestrator: { tick_interval_ms: 5000, log_level: "info" },
      api: { port: 3847, host: "localhost" },
      database: {
        host: "localhost",
        port: 5432,
        name: "orchestrator",
        user: "orchestrator",
        password_env: "ORCH_DB_PASSWORD",
        pool_min: 2,
        pool_max: 10,
        auto_migrate: true,
      },
      defaults: {
        model: "claude-opus-4-6",
        max_turns: 25,
        auto_commit: false,
        auto_pr: true,
        verification_required: true,
        brainstorm_idle_timeout_min: 30,
      },
      limits: {
        max_concurrent_agents: 5,
        max_concurrent_per_project: 3,
        max_spawns_per_hour: 20,
        cooldown_on_failure: 300,
      },
      memory: {
        extraction_on_session_end: true,
        summary_rewrite_schedule: "weekly",
        fact_decay_days: 90,
        max_entries_before_curation: 50,
      },
      orphan_detection: {
        staleness_threshold_sec: 300,
        max_process_loss_retries: 1,
      },
    };

    const result = globalConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("applies defaults for missing optional fields", () => {
    const result = globalConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.orchestrator.tick_interval_ms).toBe(5000);
      expect(result.data.api.port).toBe(3847);
      expect(result.data.defaults.model).toBe("claude-opus-4-6");
      expect(result.data.limits.max_concurrent_agents).toBe(5);
    }
  });
});

describe("projectConfigSchema", () => {
  it("accepts a valid project config", () => {
    const input = {
      project: { name: "Project Alpha", default_branch: "main" },
      defaults: { model: "claude-opus-4-6", verification_required: true },
      limits: { max_concurrent_per_project: 4 },
      budget: { limit_usd: 500.0 },
    };

    const result = projectConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("accepts empty project config", () => {
    const result = projectConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("mergeConfigs", () => {
  it("project config overrides global defaults", () => {
    const global = globalConfigSchema.parse({});
    const project = projectConfigSchema.parse({
      defaults: { model: "claude-sonnet-4-6" },
      limits: { max_concurrent_per_project: 8 },
    });

    const merged = mergeConfigs(global, project);
    expect(merged.defaults.model).toBe("claude-sonnet-4-6");
    expect(merged.limits.max_concurrent_per_project).toBe(8);
    // Global defaults remain for fields not overridden
    expect(merged.defaults.max_turns).toBe(25);
  });

  it("returns global config when project config is null", () => {
    const global = globalConfigSchema.parse({});
    const merged = mergeConfigs(global, null);
    expect(merged).toEqual(global);
  });
});

describe("loadGlobalConfig", () => {
  it("loads and parses a YAML config file", () => {
    const dir = join(tmpdir(), `orch-test-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "config.yaml");
    writeFileSync(configPath, `
orchestrator:
  tick_interval_ms: 10000
  log_level: debug
api:
  port: 4000
`);

    const config = loadGlobalConfig(configPath);
    expect(config.orchestrator.tick_interval_ms).toBe(10000);
    expect(config.orchestrator.log_level).toBe("debug");
    expect(config.api.port).toBe(4000);
    // Defaults still applied
    expect(config.api.host).toBe("localhost");
    expect(config.defaults.model).toBe("claude-opus-4-6");

    rmSync(dir, { recursive: true });
  });

  it("returns defaults when file does not exist", () => {
    const config = loadGlobalConfig("/nonexistent/path/config.yaml");
    expect(config.orchestrator.tick_interval_ms).toBe(5000);
    expect(config.api.port).toBe(3847);
  });
});

describe("loadProjectConfig", () => {
  it("loads project-level config from .orch8/config.yaml", () => {
    const dir = join(tmpdir(), `orch-proj-${randomUUID()}`);
    const orchDir = join(dir, ".orch8");
    mkdirSync(orchDir, { recursive: true });
    writeFileSync(join(orchDir, "config.yaml"), `
project:
  name: "Test Project"
defaults:
  model: claude-sonnet-4-6
budget:
  limit_usd: 100.0
`);

    const config = loadProjectConfig(dir);
    expect(config!.project?.name).toBe("Test Project");
    expect(config!.defaults?.model).toBe("claude-sonnet-4-6");
    expect(config!.budget?.limit_usd).toBe(100.0);

    rmSync(dir, { recursive: true });
  });

  it("returns null when no project config exists", () => {
    const config = loadProjectConfig("/nonexistent/project");
    expect(config).toBeNull();
  });
});
