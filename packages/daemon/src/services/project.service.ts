import { eq, and } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateProject, UpdateProject, ProjectFilter } from "@orch/shared";

type Project = typeof projects.$inferSelect;

export class ProjectService {
  constructor(private db: SchemaDb) {}

  async create(input: CreateProject): Promise<Project> {
    const [project] = await this.db.insert(projects).values(input).returning();
    return project;
  }

  async getById(id: string): Promise<Project | null> {
    const result = await this.db.select().from(projects).where(eq(projects.id, id));
    return result[0] ?? null;
  }

  async list(filter: ProjectFilter = {}): Promise<Project[]> {
    if (filter.active !== undefined) {
      return this.db.select().from(projects).where(eq(projects.active, filter.active));
    }
    return this.db.select().from(projects);
  }

  async update(id: string, input: UpdateProject): Promise<Project> {
    const [updated] = await this.db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    if (!updated) throw new Error("Project not found");
    return updated;
  }

  async archive(id: string): Promise<Project> {
    const existing = await this.getById(id);
    if (!existing) throw new Error("Project not found");

    // Pause all active agents in this project
    await this.db
      .update(agents)
      .set({
        status: "paused",
        pauseReason: "project archived",
        updatedAt: new Date(),
      })
      .where(and(eq(agents.projectId, id), eq(agents.status, "active")));

    // Set project inactive
    const [archived] = await this.db
      .update(projects)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    return archived;
  }
}
