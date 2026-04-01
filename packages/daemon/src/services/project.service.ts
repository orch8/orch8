import { eq, and } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateProject, UpdateProject, ProjectFilter } from "@orch/shared";
import { PipelineTemplateService } from "./pipeline-template.service.js";

type Project = typeof projects.$inferSelect;

export class ProjectService {
  constructor(private db: SchemaDb) {}

  async create(input: CreateProject): Promise<Project> {
    const [project] = await this.db.insert(projects).values(input).returning();
    await this.seedDefaultPipelineTemplate(project.id);
    return project;
  }

  async seedDefaultPipelineTemplate(projectId: string): Promise<void> {
    const tplService = new PipelineTemplateService(this.db);
    await tplService.create({
      projectId,
      name: "Standard Dev Flow",
      description: "Default 4-step development pipeline: research, plan, implement, review",
      isDefault: true,
      steps: [
        { order: 1, label: "research", promptTemplate: "Research the task requirements, codebase context, and constraints. Write your findings to {{pipeline.outputFilePath}}." },
        { order: 2, label: "plan", promptTemplate: "Based on the research, create a detailed implementation plan. Write the plan to {{pipeline.outputFilePath}}." },
        { order: 3, label: "implement", promptTemplate: "Follow the plan and implement the changes. Write a summary of what was done to {{pipeline.outputFilePath}}." },
        { order: 4, label: "review", promptTemplate: "Review the implementation against the plan. Verify correctness, check for issues. Write your review to {{pipeline.outputFilePath}}." },
      ],
    });
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

    return this.db.transaction(async (tx) => {
      await tx
        .update(agents)
        .set({
          status: "paused",
          pauseReason: "project archived",
          updatedAt: new Date(),
        })
        .where(and(eq(agents.projectId, id), eq(agents.status, "active")));

      const [archived] = await tx
        .update(projects)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();

      return archived;
    });
  }
}
