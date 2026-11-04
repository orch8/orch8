import { describe, expect, it } from "vitest";
import { appendTaskContext } from "../../../adapter/codex-local/prompt-builder.js";
import type { RunContext } from "../../../adapter/types.js";

describe("Codex task context", () => {
  it("gives an automation worker its actual assigned task and prior plan", () => {
    const prompt = appendTaskContext("Automation trigger: pipeline_step_ready", {
      taskId: "FAC-2", taskTitle: "Implement README usage", taskDescription: "Add a Usage section",
      pipelineContext: "Approved plan: edit README only", pipelineOutputFilePath: ".orch8/pipelines/one/Implement.md",
    } as RunContext);
    expect(prompt).toContain("Assigned task: FAC-2");
    expect(prompt).toContain("Description:\nAdd a Usage section");
    expect(prompt).toContain("Previous pipeline output:\nApproved plan: edit README only");
    expect(prompt).toContain("Write step output to: .orch8/pipelines/one/Implement.md");
  });
  it("does not add task text to non-task wakeups", () => {
    expect(appendTaskContext("Prompt", {} as RunContext)).toBe("Prompt");
  });
});
