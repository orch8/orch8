// packages/daemon/src/__tests__/adapter/args-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildArgs } from "../../adapter/args-builder.js";


describe("buildArgs", () => {
  it("includes core flags always", () => {
    const args = buildArgs({});
    expect(args).toContain("--print");
    expect(args).toContain("-");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--verbose");
  });

  it("adds --model when configured", () => {
    const args = buildArgs({ model: "claude-opus-4-6" });
    const idx = args.indexOf("--model");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("claude-opus-4-6");
  });

  it("adds --resume when sessionId provided", () => {
    const args = buildArgs({}, "session-abc");
    const idx = args.indexOf("--resume");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("session-abc");
  });

  it("does not add --resume when sessionId is undefined", () => {
    const args = buildArgs({});
    expect(args).not.toContain("--resume");
  });

  it("adds --max-turns when configured", () => {
    const args = buildArgs({ maxTurnsPerRun: 50 });
    const idx = args.indexOf("--max-turns");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("50");
  });

  it("adds --effort when configured", () => {
    const args = buildArgs({ effort: "high" });
    const idx = args.indexOf("--effort");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("high");
  });

  it("adds --chrome flag when enabled", () => {
    const args = buildArgs({ chrome: true });
    expect(args).toContain("--chrome");
  });

  it("does not add --chrome when disabled", () => {
    const args = buildArgs({ chrome: false });
    expect(args).not.toContain("--chrome");
  });

  it("adds --dangerously-skip-permissions flag when enabled", () => {
    const args = buildArgs({ dangerouslySkipPermissions: true });
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("adds --append-system-prompt-file when provided", () => {
    const args = buildArgs({}, undefined, {
      instructionsFilePath: "/tmp/inst.md",
    });
    const idx = args.indexOf("--append-system-prompt-file");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("/tmp/inst.md");
  });

  it("adds --add-dir when provided", () => {
    const args = buildArgs({}, undefined, {
      skillsDir: "/tmp/orch-skills-xyz",
    });
    const idx = args.indexOf("--add-dir");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("/tmp/orch-skills-xyz");
  });

  it("appends extraArgs at the end", () => {
    const args = buildArgs({ extraArgs: ["--foo", "bar"] });
    expect(args.at(-2)).toBe("--foo");
    expect(args.at(-1)).toBe("bar");
  });
});
