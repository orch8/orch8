import { describe, it, expect } from "vitest";
import { parseAgentsMd, stripFrontmatter } from "../defaults/agents-md-parser.js";

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

You are a test agent. Any markdown here is ignored by the parser.
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
  intervalSec: 3600
---

# CTO

Body is ignored.
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

  it("parses effort when present", () => {
    const result = parseAgentsMd(CTO_AGENTS_MD);
    expect(result.effort).toBe("high");
  });

  it("parses heartbeat intervalSec", () => {
    const result = parseAgentsMd(CTO_AGENTS_MD);
    expect(result.heartbeat).toEqual({ enabled: true, intervalSec: 3600 });
  });

  it("throws on missing required frontmatter fields", () => {
    const badMd = `---
name: broken
---

# Broken
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
      "  intervalSec: 3600",
      "  sessionCompaction:",
      "    enabled: true",
      "    maxRuns: 200",
      "    maxInputTokens: 2000000",
      "    maxAgeHours: 72",
      "---",
      "",
      "# CTO",
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
    ].join("\n");

    const parsed = parseAgentsMd(content);
    expect(parsed.heartbeat.sessionCompaction).toBeUndefined();
  });
});

describe("stripFrontmatter", () => {
  it("removes the YAML frontmatter block and leading blank lines", () => {
    const input = `---
name: a
role: b
---

# Agent

Body.
`;
    expect(stripFrontmatter(input)).toBe("# Agent\n\nBody.\n");
  });

  it("returns the full body when no frontmatter is present", () => {
    expect(stripFrontmatter("# Agent\n\nBody.\n")).toBe("# Agent\n\nBody.\n");
  });
});
