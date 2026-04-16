import { readFileSync } from "node:fs";
import { heartbeatMdPath } from "../services/agent-files.js";

export type WakeReason =
  | { source: "timer" }
  | { source: "assignment"; task: { title: string; description?: string } }
  | { source: "on_demand"; userMessage: string }
  | { source: "automation"; automation: { trigger: string; payload?: string } };

export function buildStdinPrompt(
  wake: WakeReason,
  projectRoot: string,
  slug: string,
): string {
  switch (wake.source) {
    case "timer": {
      const path = heartbeatMdPath(projectRoot, slug);
      try {
        return readFileSync(path, "utf8");
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          throw new Error(`Missing heartbeat.md for agent "${slug}" at ${path}`);
        }
        throw new Error(
          `Failed to read heartbeat.md for agent "${slug}" at ${path}: ${(err as Error).message}`,
          { cause: err },
        );
      }
    }
    case "assignment":
      return formatTaskPayload(wake.task);
    case "on_demand":
      return wake.userMessage;
    case "automation":
      return formatAutomationPayload(wake.automation);
  }
}

function formatTaskPayload(task: { title: string; description?: string }): string {
  const parts = [`Task: ${task.title}`];
  if (task.description) parts.push("", task.description);
  return parts.join("\n");
}

function formatAutomationPayload(automation: { trigger: string; payload?: string }): string {
  const parts = [`Automation trigger: ${automation.trigger}`];
  if (automation.payload) parts.push("", automation.payload);
  return parts.join("\n");
}
