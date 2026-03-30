import { knowledgeEntities } from "@orch/shared/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SchemaDb } from "../db/client.js";
import type { MemoryService, ScoredFact } from "./memory.service.js";

type Entity = typeof knowledgeEntities.$inferSelect;

export interface SummaryResult {
  entityId: string;
  filePath: string;
  factCount: number;
}

const RELEVANCE_THRESHOLD = 0.3;

export class SummaryService {
  constructor(
    private db: SchemaDb,
    private memoryService: MemoryService,
  ) {}

  async generateEntitySummary(
    entityId: string,
    summaryDir: string,
  ): Promise<SummaryResult> {
    const entity = await this.memoryService.getEntity(entityId);
    if (!entity) throw new Error("entity_not_found");

    const allFacts = await this.memoryService.listFacts(entityId);
    const relevantFacts = allFacts.filter(f => f.relevanceScore >= RELEVANCE_THRESHOLD);

    const markdown = this.renderSummary(entity, relevantFacts);

    await mkdir(summaryDir, { recursive: true });
    const filePath = path.join(summaryDir, `${entity.slug}.md`);
    await writeFile(filePath, markdown, "utf-8");

    return { entityId, filePath, factCount: relevantFacts.length };
  }

  async regenerateAllSummaries(
    projectId: string,
    summaryDir: string,
  ): Promise<SummaryResult[]> {
    const entities = await this.memoryService.listEntities({ projectId });
    const results: SummaryResult[] = [];

    for (const entity of entities) {
      const result = await this.generateEntitySummary(entity.id, summaryDir);
      results.push(result);
    }

    return results;
  }

  private renderSummary(entity: Entity, facts: ScoredFact[]): string {
    const lines: string[] = [];
    lines.push(`# ${entity.name}`);
    lines.push("");
    if (entity.description) {
      lines.push(entity.description);
      lines.push("");
    }
    lines.push(`> Type: ${entity.entityType} | Generated: ${new Date().toISOString()}`);
    lines.push("");

    if (facts.length === 0) {
      lines.push("_No relevant facts._");
      return lines.join("\n");
    }

    // Group by category
    const grouped = new Map<string, ScoredFact[]>();
    for (const fact of facts) {
      const group = grouped.get(fact.category) ?? [];
      group.push(fact);
      grouped.set(fact.category, group);
    }

    for (const [category, categoryFacts] of grouped) {
      lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}`);
      lines.push("");
      for (const fact of categoryFacts) {
        lines.push(`- ${fact.content} _(${fact.sourceAgent})_`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
