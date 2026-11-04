import { readFile } from "node:fs/promises";
import { buildStdinPrompt } from "../prompt-builder.js";
import type { RunAgentInstructions, RunContext } from "../types.js";

/** Automation wakes need the assigned task, not only the trigger name. */
export function appendTaskContext(prompt: string, ctx: RunContext): string {
  if (!ctx.taskId) return prompt;
  const details = [
    `Assigned task: ${ctx.taskId}`,
    ctx.taskTitle ? `Title: ${ctx.taskTitle}` : "",
    ctx.taskDescription ? `Description:\n${ctx.taskDescription}` : "",
    ctx.pipelineContext ? `Previous pipeline output:\n${ctx.pipelineContext}` : "",
    ctx.pipelineOutputFilePath ? `Write step output to: ${ctx.pipelineOutputFilePath}` : "",
    ctx.pipelineOutputFilePath ?
      "This is a pipeline task. After checkout and actual work, complete this step via POST ${ORCH_API_URL}/api/tasks/" +
      `${ctx.taskId}/complete with Authorization: Bearer \${ORCH_AGENT_TOKEN} and JSON {"output":"<your actual plan, implementation results, or review findings>"}. ` +
      "Do not PATCH column=done for a pipeline step. Only the POST advances the approval gate." : "",
  ].filter(Boolean).join("\n\n");
  return `${prompt}\n\n---\n\n${details}`;
}

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
