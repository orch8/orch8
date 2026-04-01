import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  globalConfigSchema,
  projectConfigSchema,
  type GlobalConfig,
  type ProjectConfig,
} from "./schema.js";

export function loadGlobalConfig(configPath: string): GlobalConfig {
  if (!existsSync(configPath)) {
    return globalConfigSchema.parse({});
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) ?? {};
  return globalConfigSchema.parse(parsed);
}

export function loadProjectConfig(projectDir: string): ProjectConfig | null {
  const configPath = join(projectDir, ".orch8", "config.yaml");
  if (!existsSync(configPath)) {
    return null;
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) ?? {};
  return projectConfigSchema.parse(parsed);
}
