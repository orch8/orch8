import { eq } from "drizzle-orm";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import type { FastifyBaseLogger } from "fastify";
import { agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { resolveClaudePath } from "../adapter/resolve-claude-path.js";
import { randomUUID } from "node:crypto";

export type SpawnFn = typeof nodeSpawn;
export type BroadcastFn = (projectId: string, message: unknown) => void;

interface AgentCreatorSession {
  sessionId: string;
  projectId: string;
  process: ChildProcess | null;
  transcript: string[];
  startedAt: Date;
  cwd: string;
  model: string;
  maxTurns: number;
  firstTurnDone: boolean;
  stdoutBuffer: string;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const TASK_COLUMNS = ["backlog", "blocked", "in_progress", "done"];

const ROLE_DEFAULTS_DOC: Record<string, string> = {
  cto: "model=claude-opus-4-20250514, maxTurns=50, heartbeat=on (120s), canCreateTasks=true, all wake triggers",
  engineer: "model=claude-opus-4-6, maxTurns=25, heartbeat=off, wakeOnAssignment+onDemand",
  qa: "model=claude-opus-4-6, maxTurns=25, heartbeat=on (60s), all wake triggers",
  researcher: "model=claude-opus-4-6, maxTurns=40, heartbeat=off, wakeOnAssignment",
  planner: "model=claude-opus-4-6, maxTurns=30, heartbeat=off, wakeOnAssignment",
  implementer: "model=claude-opus-4-6, maxTurns=40, heartbeat=off, wakeOnAssignment, maxConcurrentSubagents=3",
  reviewer: "model=claude-opus-4-6, maxTurns=20, heartbeat=off, wakeOnAssignment",
  verifier: "model=claude-opus-4-6, maxTurns=20, heartbeat=off, wakeOnAutomation",
  referee: "model=claude-opus-4-20250514, maxTurns=15, heartbeat=off, wakeOnAutomation",
  custom: "model=claude-opus-4-6, maxTurns=25, heartbeat=off, wakeOnAssignment+onDemand",
};

const SCHEMA_FIELDS_DOC = `Required fields:
- id (string, 1-100 chars): Unique agent slug/identifier
- projectId (string): The project this agent belongs to (auto-filled)
- name (string, 1-200 chars): Display name
- role (enum): cto | engineer | qa | researcher | planner | implementer | reviewer | verifier | referee | custom

Optional fields:
- icon (string): Emoji or icon identifier
- color (string): Hex color code
- model (string): LLM model name (e.g. "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001")
- effort (string): "low" | "medium" | "high"
- maxTurns (integer >= 1): Max conversation turns per run
- allowedTools (string[]): List of allowed tool names
- heartbeatEnabled (boolean): Whether agent runs on a recurring timer
- heartbeatIntervalSec (integer >= 0): Seconds between heartbeats
- wakeOnAssignment (boolean): Wake when assigned a task
- wakeOnOnDemand (boolean): Wake on manual trigger
- wakeOnAutomation (boolean): Wake on automation events
- maxConcurrentRuns (integer >= 1): Max parallel runs
- maxConcurrentTasks (integer >= 1): Max tasks agent handles simultaneously
- maxConcurrentSubagents (integer >= 0): Max subagents this agent can spawn
- canAssignTo (string[]): Agent IDs this agent can assign tasks to
- canCreateTasks (boolean): Whether agent can create new tasks
- canMoveTo (string[]): Task columns agent can move tasks to (backlog | blocked | in_progress | done)
- systemPrompt (string): Custom system prompt
- promptTemplate (string): Prompt template with variable substitution
- bootstrapPromptTemplate (string): Initial prompt template
- instructionsFilePath (string): Path to instructions file
- researchPrompt (string): Prompt for research phase
- planPrompt (string): Prompt for planning phase
- implementPrompt (string): Prompt for implementation phase
- reviewPrompt (string): Prompt for review phase
- mcpTools (string[]): MCP tool configurations
- skillPaths (string[]): Paths to skill files
- adapterType (string): Adapter type identifier
- adapterConfig (object): Adapter-specific configuration
- envVars (Record<string, string>): Environment variables
- budgetLimitUsd (number >= 0): Budget limit in USD
- autoPauseThreshold (integer 0-100): Percentage of budget that triggers auto-pause
- workingHours (string): Working hours specification`;

export class AgentCreatorService {
  private sessions = new Map<string, AgentCreatorSession>();
  private projectSessions = new Map<string, string>(); // projectId -> sessionId
  private logger: FastifyBaseLogger | null = null;

  constructor(
    private db: SchemaDb,
    private broadcast: BroadcastFn,
    private spawnFn: SpawnFn = nodeSpawn,
  ) {}

  setLogger(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  hasActiveSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  hasActiveProjectSession(projectId: string): boolean {
    return this.projectSessions.has(projectId);
  }

  getSessionByProject(projectId: string): string | null {
    return this.projectSessions.get(projectId) ?? null;
  }

  async startSession(projectId: string, cwd: string): Promise<string> {
    this.logger?.info({ projectId, cwd }, "agent-creator: startSession called");

    if (this.projectSessions.has(projectId)) {
      throw new Error(`Project ${projectId} already has an active creator session`);
    }

    const sessionId = randomUUID();
    const systemPrompt = await this.buildSystemPrompt(projectId);

    const session: AgentCreatorSession = {
      sessionId,
      projectId,
      process: null,
      transcript: [],
      startedAt: new Date(),
      cwd,
      model: "claude-sonnet-4-20250514",
      maxTurns: 50,
      firstTurnDone: false,
      stdoutBuffer: "",
      idleTimer: null,
    };

    this.sessions.set(sessionId, session);
    this.projectSessions.set(projectId, sessionId);
    session.transcript.push(`[system] ${systemPrompt}`);

    this.spawnTurn(session, systemPrompt);
    this.resetIdleTimer(session);

    this.logger?.info({ sessionId, projectId }, "agent-creator: session started");
    return sessionId;
  }

  /** Spawn a one-shot `claude --print` process for a single turn. */
  private spawnTurn(session: AgentCreatorSession, prompt: string): void {
    const args = [
      "--print", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--model", session.model,
      "--max-turns", String(session.maxTurns),
    ];

    if (session.firstTurnDone) {
      args.push("--continue");
    }

    const mergedEnv = { ...process.env };
    delete mergedEnv.CLAUDECODE;
    delete mergedEnv.CLAUDE_CODE_ENTRYPOINT;
    delete mergedEnv.CLAUDE_CODE_SESSION;
    delete mergedEnv.CLAUDE_CODE_PARENT_SESSION;

    const claudePath = resolveClaudePath();
    this.logger?.info(
      { sessionId: session.sessionId, claudePath, cwd: session.cwd, continue: session.firstTurnDone },
      "agent-creator: spawning turn",
    );

    const proc = this.spawnFn(claudePath, args, {
      cwd: session.cwd,
      env: mergedEnv,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    session.process = proc;

    proc.stdout!.on("data", (chunk: Buffer) => {
      session.stdoutBuffer += chunk.toString();
      const lines = session.stdoutBuffer.split("\n");
      session.stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const text = this.extractAssistantText(trimmed);
        if (text) {
          session.transcript.push(`[agent] ${text}`);
          this.broadcast(session.projectId, {
            type: "agent_creator_output",
            sessionId: session.sessionId,
            chunk: text,
          });
        }
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      this.logger?.warn({ sessionId: session.sessionId, stderr: chunk.toString() }, "agent-creator: stderr");
    });

    proc.on("error", (err) => {
      this.logger?.error({ sessionId: session.sessionId, err }, "agent-creator: process error");
      session.process = null;
    });

    proc.on("close", (code, signal) => {
      if (session.stdoutBuffer.trim()) {
        const text = this.extractAssistantText(session.stdoutBuffer.trim());
        if (text) {
          session.transcript.push(`[agent] ${text}`);
          this.broadcast(session.projectId, {
            type: "agent_creator_output",
            sessionId: session.sessionId,
            chunk: text,
          });
        }
        session.stdoutBuffer = "";
      }

      this.logger?.info({ sessionId: session.sessionId, code, signal }, "agent-creator: turn completed");
      session.process = null;
      session.firstTurnDone = true;
    });
  }

  private extractAssistantText(line: string): string | null {
    try {
      const event = JSON.parse(line);
      if (event.type !== "assistant" || !event.message?.content) return null;

      const texts: string[] = [];
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          texts.push(block.text);
        }
      }
      return texts.length > 0 ? texts.join("") : null;
    } catch {
      return null;
    }
  }

  private resetIdleTimer(session: AgentCreatorSession): void {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      this.logger?.info({ sessionId: session.sessionId }, "agent-creator: idle timeout, killing session");
      this.cleanupSession(session.sessionId);
    }, IDLE_TIMEOUT_MS);
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.idleTimer) clearTimeout(session.idleTimer);
    const proc = session.process;
    this.sessions.delete(sessionId);
    this.projectSessions.delete(session.projectId);
    if (proc) proc.kill("SIGTERM");
  }

  async buildSystemPrompt(projectId: string): Promise<string> {
    // Query existing agents
    const existingAgents = await this.db
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId));

    const agentsList = existingAgents.length > 0
      ? existingAgents.map((a) => `- ${a.id}: "${a.name}" (role=${a.role}, status=${a.status})`).join("\n")
      : "(none)";

    const agentIds = existingAgents.map((a) => a.id);

    const roleDefaultsList = Object.entries(ROLE_DEFAULTS_DOC)
      .map(([role, desc]) => `- ${role}: ${desc}`)
      .join("\n");

    return `You are an agent configuration assistant for orch8. You help users create AI agents by understanding their needs and generating complete configurations.

## Process

Follow this structured brainstorm process:

1. **Understand the need** — Ask clarifying questions one at a time (prefer multiple choice). Cover:
   - What should this agent do? What problem does it solve?
   - How autonomous should it be? (execute only, or can it create tasks / assign to others?)
   - When should it run? (only when assigned work, on a heartbeat timer, or on automation triggers?)
   - What model/budget tradeoff? (powerful & expensive vs. fast & cheap)

2. **Consider existing agents** — Don't duplicate existing agents. Suggest how the new agent complements them.

3. **Propose approaches** — After sufficient understanding, propose 2-3 configuration approaches with trade-offs. Recommend one.

4. **Generate config** — When the user approves, generate the full configuration as described below.

## Output Format

When presenting a configuration:
- Output the JSON inside a \`\`\`agent-config\`\`\` fenced code block
- Always include a human-readable summary alongside the JSON
- When the user requests changes, output the FULL updated config (not a diff)
- Never reference agent IDs or task columns that don't exist in the project context below

## Schema Reference

${SCHEMA_FIELDS_DOC}

## Role Defaults

When a role is selected, these defaults apply automatically unless overridden:
${roleDefaultsList}

## Project Context

### Existing Agents
${agentsList}

### Available Task Columns (for canMoveTo)
${TASK_COLUMNS.join(", ")}

### Available Agent IDs (for canAssignTo)
${agentIds.length > 0 ? agentIds.join(", ") : "(none yet — this will be the first agent)"}

## Begin

Greet the user warmly and ask what kind of agent they'd like to create. Start with one clarifying question.`;
  }
}
