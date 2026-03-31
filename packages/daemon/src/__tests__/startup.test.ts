import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { loadGlobalConfig } from "../config/loader.js";

describe("startup config integration", () => {
  it("loads config and applies it to server options", () => {
    const dir = join(tmpdir(), `orch-startup-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "config.yaml");
    writeFileSync(configPath, `
orchestrator:
  tick_interval_ms: 3000
  log_level: debug
api:
  port: 4321
  host: 0.0.0.0
database:
  pool_max: 20
  auto_migrate: false
limits:
  max_concurrent_agents: 10
orphan_detection:
  staleness_threshold_sec: 600
`);

    const config = loadGlobalConfig(configPath);
    expect(config.orchestrator.tick_interval_ms).toBe(3000);
    expect(config.api.port).toBe(4321);
    expect(config.api.host).toBe("0.0.0.0");
    expect(config.database.pool_max).toBe(20);
    expect(config.database.auto_migrate).toBe(false);
    expect(config.limits.max_concurrent_agents).toBe(10);
    expect(config.orphan_detection.staleness_threshold_sec).toBe(600);

    rmSync(dir, { recursive: true });
  });

  it("produces valid default config when no file exists", () => {
    const config = loadGlobalConfig("/nonexistent/config.yaml");

    // All defaults should be valid
    expect(config.orchestrator.tick_interval_ms).toBe(5000);
    expect(config.api.port).toBe(3847);
    expect(config.database.auto_migrate).toBe(true);
    expect(config.orphan_detection.staleness_threshold_sec).toBe(300);
  });
});
