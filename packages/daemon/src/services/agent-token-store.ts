import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

export function agentTokenPath(projectHomeDir: string, agentId: string): string {
  return path.join(projectHomeDir, ".orch8", "agents", agentId, "token");
}

export async function writeAgentToken(
  projectHomeDir: string,
  agentId: string,
  rawToken: string,
): Promise<void> {
  const tokenPath = agentTokenPath(projectHomeDir, agentId);
  const tokenDir = path.dirname(tokenPath);
  await mkdir(tokenDir, { recursive: true });

  const tmpPath = path.join(tokenDir, `.token.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmpPath, rawToken, { mode: 0o600 });
  await rename(tmpPath, tokenPath);
}

export async function readAgentToken(
  projectHomeDir: string,
  agentId: string,
): Promise<string | null> {
  try {
    return await readFile(agentTokenPath(projectHomeDir, agentId), "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteAgentToken(
  projectHomeDir: string,
  agentId: string,
): Promise<void> {
  await rm(agentTokenPath(projectHomeDir, agentId), { force: true });
}
