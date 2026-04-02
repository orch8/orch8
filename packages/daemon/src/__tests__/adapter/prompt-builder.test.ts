// packages/daemon/src/__tests__/adapter/prompt-builder.test.ts
import { describe, it, expect } from "vitest";
import { interpolateTemplate, buildPrompt } from "../../adapter/prompt-builder.js";
import type { RunContext } from "../../adapter/types.js";

describe("interpolateTemplate", () => {
  it("replaces {{variable}} with values", () => {
    const result = interpolateTemplate(
      "Hello {{name}}, welcome to {{project}}.",
      { name: "Alice", project: "Orch8" },
    );
    expect(result).toBe("Hello Alice, welcome to Orch8.");
  });

  it("replaces dotted variables like {{agent.name}}", () => {
    const result = interpolateTemplate(
      "Agent: {{agent.name}}",
      { "agent.name": "Builder Bot" },
    );
    expect(result).toBe("Agent: Builder Bot");
  });

  it("leaves unmatched variables as empty strings", () => {
    const result = interpolateTemplate(
      "Value: {{missing}}",
      {},
    );
    expect(result).toBe("Value: ");
  });

  it("handles multiple occurrences of the same variable", () => {
    const result = interpolateTemplate(
      "{{x}} and {{x}}",
      { x: "A" },
    );
    expect(result).toBe("A and A");
  });
});

const baseContext: RunContext = {
  agentId: "agent-1",
  agentName: "Builder",
  projectId: "proj-1",
  runId: "run-1",
  wakeReason: "assignment",
  apiUrl: "http://localhost:3847",
  cwd: "/tmp/ws",
  taskTitle: "Fix login bug",
  taskDescription: "The login page crashes on submit",
};

describe("buildPrompt", () => {
  it("includes only heartbeat prompt when no bootstrap or handoff", () => {
    const result = buildPrompt({
      heartbeatTemplate: "Work on: {{task.title}}",
      context: baseContext,
      isFirstRun: false,
    });
    expect(result).toBe("Work on: Fix login bug");
  });

  it("includes bootstrap prompt on first run", () => {
    const result = buildPrompt({
      heartbeatTemplate: "Do the work.",
      bootstrapTemplate: "You are {{agent.name}}.",
      context: baseContext,
      isFirstRun: true,
    });
    expect(result).toContain("You are Builder.");
    expect(result).toContain("Do the work.");
  });

  it("does not include bootstrap prompt on subsequent runs", () => {
    const result = buildPrompt({
      heartbeatTemplate: "Do the work.",
      bootstrapTemplate: "You are {{agent.name}}.",
      context: baseContext,
      isFirstRun: false,
    });
    expect(result).not.toContain("You are Builder.");
    expect(result).toContain("Do the work.");
  });

  it("includes session handoff when provided", () => {
    const result = buildPrompt({
      heartbeatTemplate: "Continue work.",
      sessionHandoff: "## Previous Context\n\nYou were fixing a login bug.",
      context: baseContext,
      isFirstRun: false,
    });
    expect(result).toContain("## Previous Context");
    expect(result).toContain("Continue work.");
  });

  it("assembles all three sections on first run with handoff", () => {
    const result = buildPrompt({
      heartbeatTemplate: "Step 3.",
      bootstrapTemplate: "Step 1.",
      sessionHandoff: "Step 2.",
      context: baseContext,
      isFirstRun: true,
    });
    const parts = result.split("\n\n");
    expect(parts[0]).toBe("Step 1.");
    expect(parts[1]).toBe("Step 2.");
    expect(parts[2]).toBe("Step 3.");
  });

  it("interpolates context.* variables", () => {
    const ctx: RunContext = {
      ...baseContext,
      context: { repo: "my-repo" },
    };
    const result = buildPrompt({
      heartbeatTemplate: "Repo: {{context.repo}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toBe("Repo: my-repo");
  });

  it("interpolates task-level context variables", () => {
    const ctx: RunContext = {
      ...baseContext,
      context: { deployTarget: "staging" },
    };
    const result = buildPrompt({
      heartbeatTemplate: "Deploy to: {{context.deployTarget}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toContain("Deploy to: staging");
  });
});

describe("prompt-builder — Phase 3 template vars", () => {
  it("interpolates {{workspace.branch}}", () => {
    const ctx: RunContext = { ...baseContext, workspaceBranch: "feature/foo" };
    const result = buildPrompt({
      heartbeatTemplate: "Branch: {{workspace.branch}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toBe("Branch: feature/foo");
  });

  it("interpolates {{workspace.repoUrl}}", () => {
    const ctx: RunContext = { ...baseContext, workspaceRepoUrl: "https://github.com/org/repo.git" };
    const result = buildPrompt({
      heartbeatTemplate: "Repo: {{workspace.repoUrl}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toBe("Repo: https://github.com/org/repo.git");
  });

  it("interpolates {{workspace.worktreePath}}", () => {
    const ctx: RunContext = { ...baseContext, worktreePath: "/worktrees/task-1" };
    const result = buildPrompt({
      heartbeatTemplate: "WT: {{workspace.worktreePath}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toBe("WT: /worktrees/task-1");
  });

  it("interpolates {{wake.commentId}}", () => {
    const ctx: RunContext = { ...baseContext, wakeCommentId: "comment-42" };
    const result = buildPrompt({
      heartbeatTemplate: "Comment: {{wake.commentId}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toBe("Comment: comment-42");
  });

  it("interpolates {{task.linkedIssueIds}}", () => {
    const ctx: RunContext = { ...baseContext, linkedIssueIds: "ISS-1,ISS-2" };
    const result = buildPrompt({
      heartbeatTemplate: "Issues: {{task.linkedIssueIds}}",
      context: ctx,
      isFirstRun: false,
    });
    expect(result).toBe("Issues: ISS-1,ISS-2");
  });

  it("replaces missing Phase 3 vars with empty string", () => {
    const result = buildPrompt({
      heartbeatTemplate: "Branch: {{workspace.branch}}, Comment: {{wake.commentId}}",
      context: baseContext,
      isFirstRun: false,
    });
    expect(result).toBe("Branch: , Comment: ");
  });
});
