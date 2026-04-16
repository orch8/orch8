import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  globalConfigSchema,
  projectConfigSchema,
  type GlobalConfig,
  type ProjectConfig,
} from "./schema.js";

export class ConfigError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ConfigError";
  }
}

function safeParseYaml(raw: string, configPath: string): unknown {
  try {
    return parseYaml(raw) ?? {};
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ConfigError(
      `Malformed YAML in ${configPath}: ${detail}`,
      err,
    );
  }
}

export function loadGlobalConfig(configPath: string): GlobalConfig {
  if (!existsSync(configPath)) {
    return globalConfigSchema.parse({});
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = safeParseYaml(raw, configPath);
  return globalConfigSchema.parse(parsed);
}

export function loadProjectConfig(projectDir: string): ProjectConfig | null {
  const configPath = join(projectDir, ".orch8", "config.yaml");
  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = safeParseYaml(raw, configPath);
  return projectConfigSchema.parse(parsed);
}
