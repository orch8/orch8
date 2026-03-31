import { eq, and } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateProject, UpdateProject, ProjectFilter } from "@orch/shared";
import { SeedingService } from "./seeding.service.js";
import { AgentService } from "./agent.service.js";

type Project = typeof projects.$inferSelect;

export class ProjectService {
  private seedingService: SeedingService;

  constructor(private db: SchemaDb, seedingService?: SeedingService) {
    this.seedingService = seedingService ?? new SeedingService();
  }

  async create(input: CreateProject): Promise<Project> {
    const [project] = await this.db.insert(projects).values(input).returning();

    // Seed default agents and skills into the new project
    try {
      await this.seedingService.copyDefaults(project.homeDir);
      await this.seedingService.ensureGitignore(project.homeDir);
      const agentDefs = await this.seedingService.parseAgentDefinitions(project.homeDir);

      const modelMap: Record<string, string> = {
        opus: "claude-opus-4-6",
        sonnet: "claude-sonnet-4-6",
        haiku: "claude-haiku-4-5-20251001",
      };

      for (const def of agentDefs) {
        const roleDefaults = AgentService.getRoleDefaults(def.role);

        await this.db.insert(agents).values({
          ...roleDefaults,
          id: def.name,
          projectId: project.id,
          name: def.name,
          role: def.role as typeof agents.$inferInsert.role,
          model: modelMap[def.model] ?? def.model,
          effort: def.effort ?? null,
          maxTurns: def.maxTurns,
          systemPrompt: def.systemPrompt,
          promptTemplate: def.promptTemplate ?? "",
          bootstrapPromptTemplate: def.bootstrapPromptTemplate ?? "",
          researchPrompt: def.researchPrompt ?? "",
          planPrompt: def.planPrompt ?? "",
          implementPrompt: def.implementPrompt ?? "",
          reviewPrompt: def.reviewPrompt ?? "",
          instructionsFilePath: def.instructionsFilePath,
          skillPaths: def.resolvedSkillPaths ?? [],
          heartbeatEnabled: def.heartbeat.enabled,
          heartbeatIntervalSec: def.heartbeat.intervalSec ?? 0,
        });
      }
    } catch (err) {
      // Seeding failure should not prevent project creation
      console.error(`Failed to seed defaults for project ${project.id}:`, err);
    }

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
