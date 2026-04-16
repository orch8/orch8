import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildStdinPrompt, type WakeReason } from "../../adapter/prompt-builder.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "stdin-prompt-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function seedAgent(slug: string, files: { heartbeat?: string } = {}): Promise<string> {
  const dir = join(tempRoot, ".orch8", "agents", slug);
  await mkdir(dir, { recursive: true });
  if (files.heartbeat !== undefined) {
    await writeFile(join(dir, "heartbeat.md"), files.heartbeat, "utf-8");
  }
  return dir;
}

describe("buildStdinPrompt", () => {
  it("reads heartbeat.md contents for timer wakes", async () => {
    await seedAgent("cto", { heartbeat: "Do your heartbeat review." });
    const wake: WakeReason = { source: "timer" };
    const out = buildStdinPrompt(wake, tempRoot, "cto");
    expect(out).toBe("Do your heartbeat review.");
  });

  it("throws when heartbeat.md is missing on a timer wake", async () => {
    await seedAgent("cto");
    const wake: WakeReason = { source: "timer" };
    expect(() => buildStdinPrompt(wake, tempRoot, "cto")).toThrow(/heartbeat\.md/);
  });

  it("formats task payload for assignment wakes", () => {
    const wake: WakeReason = {
      source: "assignment",
      task: { title: "Fix login bug", description: "Crashes on submit" },
    };
    const out = buildStdinPrompt(wake, tempRoot, "cto");
    expect(out).toContain("Fix login bug");
    expect(out).toContain("Crashes on submit");
  });

  it("returns the user message verbatim for on_demand wakes", () => {
    const wake: WakeReason = { source: "on_demand", userMessage: "hi there" };
    const out = buildStdinPrompt(wake, tempRoot, "cto");
    expect(out).toBe("hi there");
  });

  it("formats automation payload for automation wakes", () => {
    const wake: WakeReason = {
      source: "automation",
      automation: { trigger: "pr_opened", payload: "#42" },
    };
    const out = buildStdinPrompt(wake, tempRoot, "cto");
    expect(out).toContain("pr_opened");
    expect(out).toContain("#42");
  });
});
