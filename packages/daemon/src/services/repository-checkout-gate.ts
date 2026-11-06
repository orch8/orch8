import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { projects } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

// An in-process boundary for operations that start work in a checkout. Enter
// synchronously after resolving the canonical root, before making any writes.
// This covers aliases (two projects pointing at one repository) as well.
const entries = new Map<string, { writers: number; checkout: boolean }>();

async function rootFor(db: SchemaDb, projectId: string) {
  const [project] = await db.select({ homeDir: projects.homeDir }).from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error("Project not found");
  return realpath(project.homeDir).catch(() => resolve(project.homeDir));
}

export async function withRepositoryWriter<T>(db: SchemaDb, projectId: string, work: () => Promise<T>): Promise<T> {
  const release = await reserveRepositoryWriter(db, projectId);
  try { return await work(); }
  finally { release(); }
}

export async function reserveRepositoryWriter(db: SchemaDb, projectId: string): Promise<() => void> {
  const root = await rootFor(db, projectId);
  const entry = entries.get(root) ?? { writers: 0, checkout: false };
  if (entry.checkout) throw new Error("Repository checkout is in progress; retry after the branch switch.");
  entry.writers++;
  entries.set(root, entry);
  return () => {
    entry.writers--;
    if (!entry.writers && !entry.checkout) entries.delete(root);
  };
}

export async function withExclusiveRepositoryCheckout<T>(db: SchemaDb, projectId: string, work: () => Promise<T>): Promise<T> {
  const root = await rootFor(db, projectId);
  const entry = entries.get(root) ?? { writers: 0, checkout: false };
  if (entry.checkout || entry.writers) throw new Error("Repository work is starting or a checkout is already in progress.");
  entry.checkout = true;
  entries.set(root, entry);
  try { return await work(); }
  finally {
    entry.checkout = false;
    if (!entry.writers) entries.delete(root);
  }
}
