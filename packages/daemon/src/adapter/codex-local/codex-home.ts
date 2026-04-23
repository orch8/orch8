import { existsSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function ensureCodexHome(agentId: string): Promise<string> {
  const codexHome = path.join(os.homedir(), ".orch8", "agents", agentId, "codex-home");
  await mkdir(codexHome, { recursive: true });

  await seedCodexAuth(codexHome);
  await mkdir(path.join(codexHome, "skills"), { recursive: true });
  return codexHome;
}

export async function seedCodexAuth(codexHome: string): Promise<void> {
  const targetAuth = path.join(codexHome, "auth.json");
  const sourceAuth = path.join(os.homedir(), ".codex", "auth.json");
  if (!existsSync(targetAuth) && existsSync(sourceAuth)) {
    await symlink(sourceAuth, targetAuth);
  }
}
