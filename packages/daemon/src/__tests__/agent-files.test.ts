import { describe, it, expect } from "vitest";
import { agentDir, agentsMdPath, heartbeatMdPath } from "../services/agent-files.js";

describe("agent-files", () => {
  it("agentDir joins projectRoot + .orch8/agents/<slug>", () => {
    expect(agentDir("/home/p", "cto")).toBe("/home/p/.orch8/agents/cto");
  });

  it("agentsMdPath returns <agentDir>/AGENTS.md", () => {
    expect(agentsMdPath("/home/p", "cto")).toBe("/home/p/.orch8/agents/cto/AGENTS.md");
  });

  it("heartbeatMdPath returns <agentDir>/heartbeat.md", () => {
    expect(heartbeatMdPath("/home/p", "cto")).toBe("/home/p/.orch8/agents/cto/heartbeat.md");
  });
});
