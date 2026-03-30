import { eq, and, ilike, isNull, inArray, sql } from "drizzle-orm";
import { knowledgeEntities, knowledgeFacts, sharedDecisions } from "@orch/shared/db";
import { mkdir, readdir, readFile, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
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

  async createEntity(input: {
    projectId: string;
    slug: string;
    name: string;
    entityType: "project" | "area" | "archive";
    description?: string;
  }): Promise<Entity> {
    const [entity] = await this.db.insert(knowledgeEntities).values({
      projectId: input.projectId,
      slug: input.slug,
      name: input.name,
      entityType: input.entityType,
      description: input.description ?? "",
    }).returning();
    return entity;
  }

  async getEntity(id: string): Promise<Entity | null> {
    const result = await this.db.select().from(knowledgeEntities).where(eq(knowledgeEntities.id, id));
    return result[0] ?? null;
  }

  // ─── Facts ───────────────────────────────────────

  async trackAccess(factIds: string[]): Promise<void> {
    if (factIds.length === 0) return;
    await this.db
      .update(knowledgeFacts)
      .set({
        accessCount: sql`${knowledgeFacts.accessCount} + 1`,
        lastAccessed: new Date(),
      })
      .where(inArray(knowledgeFacts.id, factIds));
  }

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
    const facts = result as unknown as ScoredFact[];

    // Track access (fire-and-forget)
    const ids = facts.map(f => f.id);
    if (ids.length > 0) {
      this.trackAccess(ids).catch(() => {});
    }

    return facts;
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

  async supersedeFact(
    oldFactId: string,
    input: { content: string; category: string; sourceTask?: string },
    sourceAgent: string,
  ): Promise<{ oldFact: Fact; newFact: Fact }> {
    // 1. Load old fact
    const [oldFact] = await this.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.id, oldFactId));

    if (!oldFact) throw new Error("fact_not_found");
    if (oldFact.supersededBy) throw new Error("already_superseded");

    // 2. Create replacement fact
    const [newFact] = await this.db.insert(knowledgeFacts).values({
      entityId: oldFact.entityId,
      content: input.content,
      category: input.category as typeof oldFact.category,
      sourceAgent,
      sourceTask: input.sourceTask ?? null,
    }).returning();

    // 3. Mark old fact as superseded
    await this.db
      .update(knowledgeFacts)
      .set({ supersededBy: newFact.id })
      .where(eq(knowledgeFacts.id, oldFactId));

    const [updatedOld] = await this.db
      .select()
      .from(knowledgeFacts)
      .where(eq(knowledgeFacts.id, oldFactId));

    return { oldFact: updatedOld, newFact };
  }

  // ─── Conflict Resolution ─────────────────────────

  async writeFactWithConflictResolution(
    entityId: string,
    input: { content: string; category: string; sourceTask?: string },
    sourceAgent: string,
  ): Promise<Fact> {
    const category = input.category as Fact["category"];

    // Check for existing active facts of the same category from a different agent
    const existingFacts = await this.db
      .select()
      .from(knowledgeFacts)
      .where(
        and(
          eq(knowledgeFacts.entityId, entityId),
          eq(knowledgeFacts.category, category),
          isNull(knowledgeFacts.supersededBy),
        ),
      );

    const conflicting = existingFacts.filter(f => f.sourceAgent !== sourceAgent);

    // Always create the new fact first
    const [newFact] = await this.db.insert(knowledgeFacts).values({
      entityId,
      content: input.content,
      category,
      sourceAgent,
      sourceTask: input.sourceTask ?? null,
    }).returning();

    if (conflicting.length === 0) return newFact;

    // Apply resolution rules per category
    switch (category) {
      case "status":
      case "relationship":
      case "convention":
        // Latest timestamp wins — supersede all conflicting
        for (const old of conflicting) {
          await this.db
            .update(knowledgeFacts)
            .set({ supersededBy: newFact.id })
            .where(eq(knowledgeFacts.id, old.id));
        }
        break;

      case "decision": {
        // Escalate to shared_decisions table
        const entity = await this.getEntity(entityId);
        await this.db.insert(sharedDecisions).values({
          projectId: entity!.projectId,
          title: `Conflicting decision on ${entity!.name}`,
          decision: `${conflicting[0].content} (by ${conflicting[0].sourceAgent}) vs ${input.content} (by ${sourceAgent})`,
          madeBy: "system",
          context: `Auto-escalated: multiple agents wrote conflicting decision facts to entity "${entity!.slug}"`,
          binding: false,
        });
        break;
      }

      case "milestone":
      case "issue":
      case "observation":
        // Append-only — both kept, no supersession
        break;
    }

    return newFact;
  }

  // ─── Search ──────────────────────────────────────

  async searchFacts(search: KnowledgeSearch): Promise<Array<Fact & { entitySlug: string }>> {
    const escaped = search.query.replace(/[%_\\]/g, "\\$&");
    const conditions = [
      ilike(knowledgeFacts.content, `%${escaped}%`),
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

  // ─── Worklog (file-based) ───────────────────────

  async appendWorklog(workLogDir: string, content: string): Promise<string> {
    await mkdir(workLogDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${timestamp}.md`;
    const filePath = path.join(workLogDir, filename);
    await writeFile(filePath, content, "utf-8");
    return filename;
  }

  async readWorklog(workLogDir: string): Promise<Array<{ filename: string; content: string }>> {
    try {
      const files = await readdir(workLogDir);
      const mdFiles = files.filter(f => f.endsWith(".md")).sort().reverse();
      const entries = await Promise.all(
        mdFiles.slice(0, 50).map(async (filename) => ({
          filename,
          content: await readFile(path.join(workLogDir, filename), "utf-8"),
        })),
      );
      return entries;
    } catch {
      return [];
    }
  }

  // ─── Lessons (file-based) ──────────────────────

  async appendLesson(lessonsFile: string, content: string): Promise<void> {
    await mkdir(path.dirname(lessonsFile), { recursive: true });
    const entry = `\n---\n_${new Date().toISOString()}_\n\n${content}\n`;
    await appendFile(lessonsFile, entry, "utf-8");
  }

  async readLessons(lessonsFile: string): Promise<string> {
    try {
      return await readFile(lessonsFile, "utf-8");
    } catch {
      return "";
    }
  }
}
