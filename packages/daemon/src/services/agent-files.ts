import { join } from "node:path";

export function agentDir(projectRoot: string, slug: string): string {
  return join(projectRoot, ".orch8", "agents", slug);
}

export function agentsMdPath(projectRoot: string, slug: string): string {
  return join(agentDir(projectRoot, slug), "AGENTS.md");
}

export function heartbeatMdPath(projectRoot: string, slug: string): string {
  return join(agentDir(projectRoot, slug), "heartbeat.md");
}
