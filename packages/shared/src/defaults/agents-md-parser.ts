import matter from "gray-matter";

export interface ParsedAgentsMd {
  // Frontmatter fields
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

  // Parsed markdown sections
  systemPrompt: string;
  promptTemplate?: string;
  bootstrapPromptTemplate?: string;
  researchPrompt?: string;
  planPrompt?: string;
  implementPrompt?: string;
  reviewPrompt?: string;
}

const SECTION_MAP: Record<string, keyof ParsedAgentsMd> = {
  "on task assignment": "promptTemplate",
  "on first run": "bootstrapPromptTemplate",
  "phase: research": "researchPrompt",
  "phase: plan": "planPrompt",
  "phase: implement": "implementPrompt",
  "phase: review": "reviewPrompt",
};

export function parseAgentsMd(content: string): ParsedAgentsMd {
  const { data: fm, content: body } = matter(content);

  // Validate required frontmatter
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

  // Parse session compaction if present
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

  // Parse markdown sections
  const sections = parseSections(body);

  return {
    name: fm.name,
    role: fm.role,
    model: fm.model,
    effort: fm.effort,
    maxTurns: fm.maxTurns,
    skills,
    heartbeat: {
      enabled: Boolean(heartbeat.enabled),
      ...(heartbeat.intervalSec != null
        ? { intervalSec: heartbeat.intervalSec }
        : {}),
      ...(sessionCompaction ? { sessionCompaction } : {}),
    },
    systemPrompt: sections.systemPrompt,
    ...(sections.promptTemplate != null
      ? { promptTemplate: sections.promptTemplate }
      : {}),
    ...(sections.bootstrapPromptTemplate != null
      ? { bootstrapPromptTemplate: sections.bootstrapPromptTemplate }
      : {}),
    ...(sections.researchPrompt != null
      ? { researchPrompt: sections.researchPrompt }
      : {}),
    ...(sections.planPrompt != null
      ? { planPrompt: sections.planPrompt }
      : {}),
    ...(sections.implementPrompt != null
      ? { implementPrompt: sections.implementPrompt }
      : {}),
    ...(sections.reviewPrompt != null
      ? { reviewPrompt: sections.reviewPrompt }
      : {}),
  };
}

interface ParsedSections {
  systemPrompt: string;
  promptTemplate?: string;
  bootstrapPromptTemplate?: string;
  researchPrompt?: string;
  planPrompt?: string;
  implementPrompt?: string;
  reviewPrompt?: string;
}

function parseSections(body: string): ParsedSections {
  const lines = body.split("\n");

  // Find the # Name heading (h1) — everything after it until first ## is systemPrompt
  const systemPromptLines: string[] = [];
  let currentSection: string | null = null;
  const sectionLines: Record<string, string[]> = {};
  let foundH1 = false;
  let inSystemPrompt = false;

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)$/);
    const h1Match = line.match(/^# (.+)$/);

    if (h1Match && !foundH1) {
      foundH1 = true;
      inSystemPrompt = true;
      continue;
    }

    if (h2Match) {
      inSystemPrompt = false;
      const sectionName = h2Match[1].trim().toLowerCase();
      if (sectionName in SECTION_MAP) {
        currentSection = sectionName;
        sectionLines[currentSection] = [];
      } else {
        currentSection = null;
      }
      continue;
    }

    if (inSystemPrompt) {
      systemPromptLines.push(line);
    } else if (currentSection != null) {
      sectionLines[currentSection].push(line);
    }
  }

  const result: ParsedSections = {
    systemPrompt: systemPromptLines.join("\n").trim(),
  };

  for (const [sectionName, fieldName] of Object.entries(SECTION_MAP)) {
    if (sectionLines[sectionName]) {
      const content = sectionLines[sectionName].join("\n").trim();
      if (content) {
        (result as unknown as Record<string, string>)[fieldName] = content;
      }
    }
  }

  return result;
}
