import { eq, and, or } from "drizzle-orm";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { existsSync } from "node:fs";
import { projectSkills, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import matter from "gray-matter";

export type TrustLevel = "markdown_only" | "assets" | "scripts_executables";

const SCRIPT_EXTENSIONS = new Set([".sh", ".js", ".ts", ".py", ".rb"]);

export function deriveTrustLevel(filenames: string[]): TrustLevel {
  let hasNonMarkdown = false;

  for (const name of filenames) {
    const ext = extname(name).toLowerCase();
    if (SCRIPT_EXTENSIONS.has(ext)) return "scripts_executables";
    if (ext !== ".md") hasNonMarkdown = true;
  }

  return hasNonMarkdown ? "assets" : "markdown_only";
}
