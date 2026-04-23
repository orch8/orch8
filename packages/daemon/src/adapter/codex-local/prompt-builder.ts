import { readFile } from "node:fs/promises";
import { buildStdinPrompt } from "../prompt-builder.js";
import type { RunAgentInstructions } from "../types.js";

export async function buildCodexPrompt(
  agentsMdPath: string,
  instructions: RunAgentInstructions,
): Promise<string> {
  const agentsMd = await readFile(agentsMdPath, "utf-8");
  const wakePrompt = buildStdinPrompt(
    instructions.wake,
    instructions.projectRoot,
    instructions.slug,
  );
  const parts = [agentsMd.trim(), "---", wakePrompt];
  if (instructions.sessionHandoff) {
    parts.push(instructions.sessionHandoff);
  }
  return parts.filter(Boolean).join("\n\n");
}
