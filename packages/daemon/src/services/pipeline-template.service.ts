import { eq } from "drizzle-orm";
import { pipelineTemplates } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreatePipelineTemplate, UpdatePipelineTemplate, PipelineTemplateFilter } from "@orch/shared";

type PipelineTemplate = typeof pipelineTemplates.$inferSelect;

export class PipelineTemplateService {
  constructor(private db: SchemaDb) {}

  async create(input: CreatePipelineTemplate): Promise<PipelineTemplate> {
    const [tpl] = await this.db.insert(pipelineTemplates).values({
      projectId: input.projectId,
      name: input.name,
      description: input.description,
      isDefault: input.isDefault,
      steps: input.steps,
    }).returning();
    return tpl;
  }

  async list(filter: PipelineTemplateFilter): Promise<PipelineTemplate[]> {
    if (filter.projectId) {
      return this.db.select().from(pipelineTemplates)
        .where(eq(pipelineTemplates.projectId, filter.projectId));
    }
    return this.db.select().from(pipelineTemplates);
  }

  async getById(id: string): Promise<PipelineTemplate | null> {
    const result = await this.db.select().from(pipelineTemplates)
      .where(eq(pipelineTemplates.id, id));
    return result[0] ?? null;
  }

  async update(id: string, input: UpdatePipelineTemplate): Promise<PipelineTemplate> {
    const [updated] = await this.db
      .update(pipelineTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(pipelineTemplates.id, id))
      .returning();
    if (!updated) throw new Error("Pipeline template not found");
    return updated;
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(pipelineTemplates)
      .where(eq(pipelineTemplates.id, id)).returning();
    if (result.length === 0) throw new Error("Pipeline template not found");
  }

  async getDefaultForProject(projectId: string): Promise<PipelineTemplate | null> {
    const result = await this.db.select().from(pipelineTemplates)
      .where(eq(pipelineTemplates.projectId, projectId))
      .limit(1);
    // Prefer isDefault=true, fallback to first
    const defaultTpl = result.find(t => t.isDefault);
    return defaultTpl ?? result[0] ?? null;
  }
}
