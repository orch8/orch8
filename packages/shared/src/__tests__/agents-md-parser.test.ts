import { describe, it, expect } from "vitest";
import { parseAgentsMd } from "../defaults/agents-md-parser.js";

const MINIMAL_AGENTS_MD = `---
name: test-agent
role: implementer
model: sonnet
maxTurns: 40
skills:
  - tdd
  - verification
heartbeat:
  enabled: false
---

# Test Agent

You are a test agent. You do test things.

## On Task Assignment

You are working on: **{{task.title}}**

{{task.description}}

## On First Run

Read the codebase first.

## Phase: Implement

Execute the plan.
`;

const CTO_AGENTS_MD = `---
name: cto
role: cto
model: opus
effort: high
maxTurns: 50
skills:
  - verification
  - parallel-decomposition
heartbeat:
  enabled: true
  intervalSec: 120
---

# CTO

You are the CTO agent. You provide oversight.

## On Task Assignment

Assess this task: **{{task.title}}**

## On First Run

Welcome to the project.
`;

const MINIMAL_NO_SECTIONS = `---
name: simple
role: custom
model: sonnet
maxTurns: 10
skills: []
heartbeat:
  enabled: false
---

# Simple Agent

Just a simple agent with no extra sections.
`;

describe("parseAgentsMd", () => {
  it("parses frontmatter fields", () => {
    const result = parseAgentsMd(MINIMAL_AGENTS_MD);

    expect(result.name).toBe("test-agent");
    expect(result.role).toBe("implementer");
    expect(result.model).toBe("sonnet");
    expect(result.maxTurns).toBe(40);
    expect(result.skills).toEqual(["tdd", "verification"]);
    expect(result.heartbeat).toEqual({ enabled: false });
  });

  it("extracts system prompt from body after # Name heading", () => {
    const result = parseAgentsMd(MINIMAL_AGENTS_MD);

    expect(result.systemPrompt).toContain("You are a test agent.");
    expect(result.systemPrompt).toContain("You do test things.");
    // Should NOT contain section headings or their content
    expect(result.systemPrompt).not.toContain("On Task Assignment");
    expect(result.systemPrompt).not.toContain("Phase: Implement");
  });

  it("extracts promptTemplate from ## On Task Assignment", () => {
    const result = parseAgentsMd(MINIMAL_AGENTS_MD);

    expect(result.promptTemplate).toContain("You are working on: **{{task.title}}**");
    expect(result.promptTemplate).toContain("{{task.description}}");
  });

  it("extracts bootstrapPromptTemplate from ## On First Run", () => {
    const result = parseAgentsMd(MINIMAL_AGENTS_MD);

    expect(result.bootstrapPromptTemplate).toContain("Read the codebase first.");
  });

  it("extracts phase-specific prompts from ## Phase: X sections", () => {
    const result = parseAgentsMd(MINIMAL_AGENTS_MD);

    expect(result.implementPrompt).toContain("Execute the plan.");
  });

  it("returns undefined for missing sections", () => {
    const result = parseAgentsMd(MINIMAL_NO_SECTIONS);

    expect(result.promptTemplate).toBeUndefined();
    expect(result.bootstrapPromptTemplate).toBeUndefined();
    expect(result.researchPrompt).toBeUndefined();
    expect(result.planPrompt).toBeUndefined();
    expect(result.implementPrompt).toBeUndefined();
    expect(result.reviewPrompt).toBeUndefined();
  });

  it("handles agent with effort field", () => {
    const result = parseAgentsMd(CTO_AGENTS_MD);

    expect(result.effort).toBe("high");
  });

  it("handles heartbeat with intervalSec", () => {
    const result = parseAgentsMd(CTO_AGENTS_MD);

    expect(result.heartbeat).toEqual({ enabled: true, intervalSec: 120 });
  });

  it("extracts system prompt that stops before first ## section", () => {
    const result = parseAgentsMd(CTO_AGENTS_MD);

    expect(result.systemPrompt).toContain("You are the CTO agent.");
    expect(result.systemPrompt).toContain("You provide oversight.");
    expect(result.systemPrompt).not.toContain("On Task Assignment");
  });

  it("throws on missing required frontmatter fields", () => {
    const badMd = `---
name: broken
---

# Broken
No role field.
`;
    expect(() => parseAgentsMd(badMd)).toThrow();
  });
});

describe("parseAgentsMd — sessionCompaction", () => {
  it("parses sessionCompaction from heartbeat block", () => {
    const content = [
      "---",
      "name: cto",
      "role: cto",
      "model: opus",
      "maxTurns: 50",
      "heartbeat:",
      "  enabled: true",
      "  intervalSec: 120",
      "  sessionCompaction:",
      "    enabled: true",
      "    maxRuns: 200",
      "    maxInputTokens: 2000000",
      "    maxAgeHours: 72",
      "---",
      "",
      "# CTO",
      "",
      "System prompt.",
    ].join("\n");

    const parsed = parseAgentsMd(content);
    expect(parsed.heartbeat.sessionCompaction).toEqual({
      enabled: true,
      maxRuns: 200,
      maxInputTokens: 2000000,
      maxAgeHours: 72,
    });
  });

  it("defaults sessionCompaction to undefined when not present", () => {
    const content = [
      "---",
      "name: eng",
      "role: engineer",
      "model: opus",
      "maxTurns: 10",
      "heartbeat:",
      "  enabled: true",
      "---",
      "",
      "# Eng",
      "",
      "System prompt.",
    ].join("\n");

    const parsed = parseAgentsMd(content);
    expect(parsed.heartbeat.sessionCompaction).toBeUndefined();
  });

  it("parses partial sessionCompaction (only maxRuns)", () => {
    const content = [
      "---",
      "name: qa",
      "role: qa",
      "model: opus",
      "maxTurns: 10",
      "heartbeat:",
      "  enabled: true",
      "  sessionCompaction:",
      "    enabled: true",
      "    maxRuns: 100",
      "---",
      "",
      "# QA",
      "",
      "System prompt.",
    ].join("\n");

    const parsed = parseAgentsMd(content);
    expect(parsed.heartbeat.sessionCompaction).toEqual({
      enabled: true,
      maxRuns: 100,
    });
  });
});
