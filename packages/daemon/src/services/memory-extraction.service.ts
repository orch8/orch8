import type { SchemaDb } from "../db/client.js";
import type { MemoryService } from "./memory.service.js";

type Fact = { content: string; category: string };

const SECTION_CATEGORY_MAP: Record<string, string> = {
  decisions: "decision",
  decision: "decision",
  status: "status",
  statuses: "status",
  milestones: "milestone",
  milestone: "milestone",
  issues: "issue",
  issue: "issue",
  bugs: "issue",
  relationships: "relationship",
  relationship: "relationship",
  dependencies: "relationship",
  conventions: "convention",
  convention: "convention",
  patterns: "convention",
  observations: "observation",
  observation: "observation",
  notes: "observation",
};

export class MemoryExtractionService {
  constructor(
    private db: SchemaDb,
    private memoryService: MemoryService,
  ) {}

  /**
   * Extracts structured facts from a work log markdown string.
   * Looks for sections like "### Decisions", "### Issues", etc.
   * and extracts bullet points as facts.
   */
  async extractFromWorklogContent(
    content: string,
    entityId: string,
    sourceAgent: string,
  ): Promise<Array<{ id: string; content: string; category: string }>> {
    if (!content.trim()) return [];

    const extracted = this.parseWorklog(content);
    if (extracted.length === 0) return [];

    const results: Array<{ id: string; content: string; category: string }> = [];

    for (const fact of extracted) {
      const written = await this.memoryService.writeFact(
        entityId,
        { content: fact.content, category: fact.category as any },
        sourceAgent,
      );
      results.push({ id: written.id, content: written.content, category: written.category });
    }

    return results;
  }

  private parseWorklog(content: string): Fact[] {
    const lines = content.split("\n");
    const facts: Fact[] = [];
    let currentCategory: string | null = null;

    for (const line of lines) {
      // Match section headers: ### Decisions, ### Status, etc.
      const headerMatch = line.match(/^#{1,4}\s+(.+)$/);
      if (headerMatch) {
        const sectionName = headerMatch[1].trim().toLowerCase();
        currentCategory = SECTION_CATEGORY_MAP[sectionName] ?? null;
        continue;
      }

      // Match bullet points under a known section
      if (currentCategory) {
        const bulletMatch = line.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
          const factContent = bulletMatch[1].trim();
          if (factContent.length > 0) {
            facts.push({ content: factContent, category: currentCategory });
          }
        }
      }
    }

    return facts;
  }
}
