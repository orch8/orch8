import { eq, and, ilike, isNull, sql } from "drizzle-orm";
import { knowledgeEntities, knowledgeFacts } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { CreateFact, EntityFilter, KnowledgeSearch } from "@orch/shared";

type Entity = typeof knowledgeEntities.$inferSelect;
type Fact = typeof knowledgeFacts.$inferSelect;

export interface ScoredFact extends Fact {
  relevanceScore: number;
}

export class MemoryService {
  constructor(private db: SchemaDb) {}

  // ─── Entities ────────────────────────────────────

  async listEntities(filter: EntityFilter): Promise<Entity[]> {
    const conditions = [];
    if (filter.projectId) conditions.push(eq(knowledgeEntities.projectId, filter.projectId));
    if (filter.entityType) conditions.push(eq(knowledgeEntities.entityType, filter.entityType));

    if (conditions.length === 0) return this.db.select().from(knowledgeEntities);
    return this.db.select().from(knowledgeEntities).where(and(...conditions));
  }

  async getEntity(id: string): Promise<Entity | null> {
    const result = await this.db.select().from(knowledgeEntities).where(eq(knowledgeEntities.id, id));
    return result[0] ?? null;
  }

  // ─── Facts ───────────────────────────────────────

  async listFacts(entityId: string): Promise<ScoredFact[]> {
    const result = await this.db.execute(sql`
      SELECT
        id, entity_id AS "entityId", content, category,
        source_agent AS "sourceAgent", source_task AS "sourceTask",
        superseded_by AS "supersededBy",
        access_count AS "accessCount",
        last_accessed AS "lastAccessed",
        created_at AS "createdAt",
        GREATEST(0, 1.0 - (EXTRACT(EPOCH FROM (now() - COALESCE(last_accessed, created_at))) / (90 * 86400))) * 0.6
          + LEAST(1.0, access_count::float / 10.0) * 0.4
          AS "relevanceScore"
      FROM knowledge_facts
      WHERE entity_id = ${entityId}
        AND superseded_by IS NULL
      ORDER BY "relevanceScore" DESC
    `);
    return result as unknown as ScoredFact[];
  }

  async writeFact(entityId: string, input: CreateFact, sourceAgent: string): Promise<Fact> {
    const [fact] = await this.db.insert(knowledgeFacts).values({
      entityId,
      content: input.content,
      category: input.category,
      sourceAgent,
      sourceTask: input.sourceTask ?? null,
    }).returning();
    return fact;
  }

  // ─── Search ──────────────────────────────────────

  async searchFacts(search: KnowledgeSearch): Promise<Array<Fact & { entitySlug: string }>> {
    const conditions = [
      ilike(knowledgeFacts.content, `%${search.query}%`),
      isNull(knowledgeFacts.supersededBy),
    ];

    if (search.projectId) {
      conditions.push(eq(knowledgeEntities.projectId, search.projectId));
    }

    const results = await this.db
      .select({
        id: knowledgeFacts.id,
        entityId: knowledgeFacts.entityId,
        content: knowledgeFacts.content,
        category: knowledgeFacts.category,
        sourceAgent: knowledgeFacts.sourceAgent,
        sourceTask: knowledgeFacts.sourceTask,
        supersededBy: knowledgeFacts.supersededBy,
        accessCount: knowledgeFacts.accessCount,
        lastAccessed: knowledgeFacts.lastAccessed,
        createdAt: knowledgeFacts.createdAt,
        entitySlug: knowledgeEntities.slug,
      })
      .from(knowledgeFacts)
      .innerJoin(knowledgeEntities, eq(knowledgeFacts.entityId, knowledgeEntities.id))
      .where(and(...conditions))
      .limit(50);

    return results;
  }
}
