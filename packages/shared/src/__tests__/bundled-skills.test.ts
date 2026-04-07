import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const SKILLS_DIR = join(__dirname, "..", "..", "defaults", "skills");

const REQUIRED_NEW_SLUGS = [
  "_card-protocol",
  "brainstorm",
  "tasks",
  "agents",
  "pipelines",
  "runs",
  "cost-and-budget",
  "memory",
];

describe("Bundled chat-redesign skills", () => {
  it("the bundled skills directory exists", () => {
    expect(existsSync(SKILLS_DIR)).toBe(true);
    expect(statSync(SKILLS_DIR).isDirectory()).toBe(true);
  });

  for (const slug of REQUIRED_NEW_SLUGS) {
    describe(`skill: ${slug}`, () => {
      const skillDir = join(SKILLS_DIR, slug);
      const skillMd = join(skillDir, "SKILL.md");

      it("has a SKILL.md file", () => {
        expect(existsSync(skillMd)).toBe(true);
      });

      it("has valid frontmatter with name and description", () => {
        const content = readFileSync(skillMd, "utf-8");
        const { data } = matter(content);
        expect(typeof data.name).toBe("string");
        expect((data.name as string).length).toBeGreaterThan(0);
        expect(typeof data.description).toBe("string");
        expect((data.description as string).length).toBeGreaterThan(20);
      });

      it("frontmatter `name` matches the directory slug", () => {
        const content = readFileSync(skillMd, "utf-8");
        const { data } = matter(content);
        expect(data.name).toBe(slug);
      });

      it("body has non-trivial content", () => {
        const content = readFileSync(skillMd, "utf-8");
        const { content: body } = matter(content);
        expect(body.length).toBeGreaterThan(500);
      });
    });
  }

  it("the existing orch8 skill still parses cleanly", () => {
    const content = readFileSync(join(SKILLS_DIR, "orch8", "SKILL.md"), "utf-8");
    const { data } = matter(content);
    expect(data.name).toBe("orch8");
    expect(typeof data.description).toBe("string");
  });

  it("every directory under skills/ has a SKILL.md (no orphan directories)", () => {
    const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillMd = join(SKILLS_DIR, e.name, "SKILL.md");
      expect(existsSync(skillMd), `Missing SKILL.md for ${e.name}`).toBe(true);
    }
  });
});
