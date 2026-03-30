import { sql } from "drizzle-orm";
import type { SchemaDb } from "../db/client.js";

export interface ScoredFact {
  id: string;
  content: string;
  category: string;
  source_agent: string;
  created_at: Date;
  access_count: number;
  last_accessed: Date | null;
  relevance_score: number;
}

export class KnowledgeService {
  constructor(private db: SchemaDb) {}

  async scoreFacts(entityId: string): Promise<ScoredFact[]> {
    const result = await this.db.execute(sql`
      SELECT
        id, content, category, source_agent, created_at,
        access_count, last_accessed,
        GREATEST(0, 1.0 - (EXTRACT(EPOCH FROM (now() - last_accessed)) / (90 * 86400))) * 0.6
          + LEAST(1.0, access_count::float / 10.0) * 0.4
          AS relevance_score
      FROM knowledge_facts
      WHERE entity_id = ${entityId}
        AND superseded_by IS NULL
      ORDER BY relevance_score DESC
    `);
    return result as unknown as ScoredFact[];
  }
}
