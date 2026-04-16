import { describe, it, expect } from "vitest";
import {
  generateAgentToken,
  hashAgentToken,
  agentTokenMatches,
} from "../api/middleware/agent-token.js";

describe("agent-token helper", () => {
  it("generates 32-hex-char (128-bit) tokens", () => {
    const tok = generateAgentToken();
    expect(tok).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates distinct tokens on each call", () => {
    const a = generateAgentToken();
    const b = generateAgentToken();
    expect(a).not.toBe(b);
  });

  it("hashAgentToken produces a deterministic 64-hex-char SHA-256 digest", () => {
    const hash = hashAgentToken("hello");
    expect(hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("agentTokenMatches accepts a token matching the stored hash", () => {
    const raw = generateAgentToken();
    const hash = hashAgentToken(raw);
    expect(agentTokenMatches(raw, hash)).toBe(true);
  });

  it("agentTokenMatches rejects a mismatched token", () => {
    const hash = hashAgentToken(generateAgentToken());
    expect(agentTokenMatches("nope", hash)).toBe(false);
  });

  it("agentTokenMatches rejects malformed hash lengths without throwing", () => {
    expect(agentTokenMatches("anything", "deadbeef")).toBe(false);
  });
});
