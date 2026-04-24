import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agentTokenPath,
  deleteAgentToken,
  readAgentToken,
  writeAgentToken,
} from "../services/agent-token-store.js";

describe("agent-token-store", () => {
  it("round-trips token files with 0600 permissions", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "agent-token-store-"));

    await writeAgentToken(homeDir, "agent-1", "abc123");

    expect(await readAgentToken(homeDir, "agent-1")).toBe("abc123");
    const mode = (await stat(agentTokenPath(homeDir, "agent-1"))).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("uses tmp-then-rename without leaving successful tmp files behind", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "agent-token-store-"));

    await writeAgentToken(homeDir, "agent-1", "first");
    await writeAgentToken(homeDir, "agent-1", "second");

    expect(await readAgentToken(homeDir, "agent-1")).toBe("second");
    const files = await readdir(join(homeDir, ".orch8", "agents", "agent-1"));
    expect(files.sort()).toEqual(["token"]);
  });

  it("returns null for missing files and deletes idempotently", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "agent-token-store-"));

    expect(await readAgentToken(homeDir, "agent-1")).toBeNull();
    await deleteAgentToken(homeDir, "agent-1");

    await writeAgentToken(homeDir, "agent-1", "abc123");
    await deleteAgentToken(homeDir, "agent-1");
    await deleteAgentToken(homeDir, "agent-1");

    expect(await readAgentToken(homeDir, "agent-1")).toBeNull();
  });
});
