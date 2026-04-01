import { describe, it, expect } from "vitest";
import { deriveTrustLevel } from "../services/project-skill.service.js";

describe("deriveTrustLevel", () => {
  it("returns markdown_only for only .md files", () => {
    expect(deriveTrustLevel(["README.md", "SKILL.md"])).toBe("markdown_only");
  });

  it("returns scripts_executables for .sh files", () => {
    expect(deriveTrustLevel(["SKILL.md", "setup.sh"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .ts files", () => {
    expect(deriveTrustLevel(["SKILL.md", "helper.ts"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .js files", () => {
    expect(deriveTrustLevel(["index.js"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .py files", () => {
    expect(deriveTrustLevel(["run.py"])).toBe("scripts_executables");
  });

  it("returns scripts_executables for .rb files", () => {
    expect(deriveTrustLevel(["task.rb"])).toBe("scripts_executables");
  });

  it("returns assets for non-markdown non-script files", () => {
    expect(deriveTrustLevel(["SKILL.md", "diagram.png"])).toBe("assets");
  });

  it("returns scripts_executables when both scripts and assets exist", () => {
    expect(deriveTrustLevel(["SKILL.md", "run.sh", "logo.png"])).toBe("scripts_executables");
  });

  it("returns markdown_only for empty array", () => {
    expect(deriveTrustLevel([])).toBe("markdown_only");
  });
});
