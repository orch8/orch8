import matter from "gray-matter";

export interface ParsedAgentsMd {
  name: string;
  role: string;
  model: string;
  effort?: string;
  maxTurns: number;
  skills: string[];
  heartbeat: {
    enabled: boolean;
    intervalSec?: number;
    sessionCompaction?: {
      enabled: boolean;
      maxRuns?: number;
      maxInputTokens?: number;
      maxAgeHours?: number;
    };
  };
}

export function parseAgentsMd(content: string): ParsedAgentsMd {
  const { data: fm } = matter(content);

  if (!fm.name || typeof fm.name !== "string") {
    throw new Error("AGENTS.md missing required frontmatter field: name");
  }
  if (!fm.role || typeof fm.role !== "string") {
    throw new Error("AGENTS.md missing required frontmatter field: role");
  }
  if (!fm.model || typeof fm.model !== "string") {
    throw new Error("AGENTS.md missing required frontmatter field: model");
  }
  if (fm.maxTurns == null || typeof fm.maxTurns !== "number") {
    throw new Error("AGENTS.md missing required frontmatter field: maxTurns");
  }

  const heartbeat = fm.heartbeat ?? { enabled: false };
  const skills: string[] = Array.isArray(fm.skills) ? fm.skills : [];

  const sessionCompaction = heartbeat.sessionCompaction
    ? {
        enabled: Boolean(heartbeat.sessionCompaction.enabled),
        ...(heartbeat.sessionCompaction.maxRuns != null
          ? { maxRuns: heartbeat.sessionCompaction.maxRuns }
          : {}),
        ...(heartbeat.sessionCompaction.maxInputTokens != null
          ? { maxInputTokens: heartbeat.sessionCompaction.maxInputTokens }
          : {}),
        ...(heartbeat.sessionCompaction.maxAgeHours != null
          ? { maxAgeHours: heartbeat.sessionCompaction.maxAgeHours }
          : {}),
      }
    : undefined;

  return {
    name: fm.name,
    role: fm.role,
    model: fm.model,
    effort: fm.effort,
    maxTurns: fm.maxTurns,
    skills,
    heartbeat: {
      enabled: Boolean(heartbeat.enabled),
      ...(heartbeat.intervalSec != null ? { intervalSec: heartbeat.intervalSec } : {}),
      ...(sessionCompaction ? { sessionCompaction } : {}),
    },
  };
}

/**
 * Returns `content` with the YAML frontmatter block stripped.
 * Used when copying bundled AGENTS.md into a project so the user's
 * editable copy is pure prose.
 */
export function stripFrontmatter(content: string): string {
  const { content: body } = matter(content);
  return body.replace(/^\n+/, "");
}
