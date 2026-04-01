import { eq, and } from "drizzle-orm";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import type { FastifyBaseLogger } from "fastify";
import { tasks, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import { resolveClaudePath } from "../adapter/resolve-claude-path.js";

export type SpawnFn = typeof nodeSpawn;
export type BroadcastFn = (projectId: string, message: unknown) => void;

interface BrainstormSession {
  taskId: string;
  projectId: string;
  process: ChildProcess | null;
  transcript: string[];
  startedAt: Date;
  cwd: string;
  model: string;
  maxTurns: number;
  firstTurnDone: boolean;
  stdoutBuffer: string;
}

export class BrainstormService {
  private sessions = new Map<string, BrainstormSession>();
  private logger: FastifyBaseLogger | null = null;

  constructor(
    private db: SchemaDb,
    private broadcast: BroadcastFn,
    private spawnFn: SpawnFn = nodeSpawn,
  ) {}

  setLogger(logger: FastifyBaseLogger): void {
    this.logger = logger;
  }

  hasActiveSession(taskId: string): boolean {
    return this.sessions.has(taskId);
  }

  async startSession(taskId: string, cwd: string): Promise<void> {
    this.logger?.info({ taskId, cwd }, "brainstorm: startSession called");

    if (this.sessions.has(taskId)) {
      throw new Error(`Task ${taskId} already has an active session`);
    }

    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new Error("Task not found");
    if (task.taskType !== "brainstorm") throw new Error("Task is not a brainstorm task");

    // Resolve agent config
    let model = "claude-sonnet-4-6";
    let maxTurns = 50;
    if (task.assignee) {
      const [agent] = await this.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, task.assignee), eq(agents.projectId, task.projectId)));
      if (agent) {
        model = agent.model;
        maxTurns = agent.maxTurns;
      }
    }

    const initialPrompt = task.description || task.title;

    const session: BrainstormSession = {
      taskId,
      projectId: task.projectId,
      process: null,
      transcript: [],
      startedAt: new Date(),
      cwd,
      model,
      maxTurns,
      firstTurnDone: false,
      stdoutBuffer: "",
    };

    this.sessions.set(taskId, session);
    session.transcript.push(`[user] ${initialPrompt}`);

    // Spawn the first turn
    const pid = this.spawnTurn(session, initialPrompt);

    // Update task with session PID
    await this.db.update(tasks).set({
      brainstormSessionPid: pid,
      column: "in_progress",
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));

    this.logger?.info({ taskId, pid }, "brainstorm: session started successfully");
  }

  async sendMessage(taskId: string, content: string): Promise<void> {
    this.logger?.info({ taskId, contentLength: content.length }, "brainstorm: sendMessage called");

    const session = this.sessions.get(taskId);
    if (!session) {
      this.logger?.warn({ taskId }, "brainstorm: sendMessage failed — no active session");
      throw new Error("No active brainstorm session for this task");
    }

    if (session.process) {
      this.logger?.warn({ taskId }, "brainstorm: previous turn still in-flight");
      throw new Error("Agent is still processing the previous message");
    }

    session.transcript.push(`[user] ${content}`);
    this.spawnTurn(session, content);
    this.logger?.info({ taskId }, "brainstorm: follow-up turn spawned");
  }

  async markReady(taskId: string): Promise<void> {
    this.logger?.info({ taskId }, "brainstorm: markReady called");

    const session = this.sessions.get(taskId);
    if (!session) throw new Error("No active brainstorm session for this task");

    const transcript = session.transcript.join("\n\n");
    this.logger?.info({ taskId, transcriptEntries: session.transcript.length }, "brainstorm: saving transcript and killing process");

    // Delete session BEFORE killing — the mock kill synchronously emits
    // "close", which would otherwise race with the close handler.
    const proc = session.process;
    this.sessions.delete(taskId);
    if (proc) proc.kill("SIGTERM");

    // Update task
    await this.db.update(tasks).set({
      brainstormStatus: "ready",
      brainstormTranscript: transcript,
      brainstormSessionPid: null,
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));

    this.logger?.info({ taskId }, "brainstorm: session marked ready");
  }

  async killSession(taskId: string): Promise<void> {
    this.logger?.info({ taskId }, "brainstorm: killSession called");

    const session = this.sessions.get(taskId);
    if (!session) throw new Error("No active brainstorm session for this task");

    // Delete session BEFORE killing — same rationale as markReady.
    const proc = session.process;
    this.sessions.delete(taskId);
    if (proc) proc.kill("SIGTERM");

    await this.db.update(tasks).set({
      brainstormStatus: "expired",
      brainstormSessionPid: null,
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));

    this.logger?.info({ taskId }, "brainstorm: session killed");
  }

  async getTranscript(taskId: string): Promise<string | null> {
    // Check active session first
    const session = this.sessions.get(taskId);
    if (session) {
      return session.transcript.join("\n\n");
    }

    // Fall back to stored transcript
    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    return task?.brainstormTranscript ?? null;
  }

  /** Spawn a one-shot `claude --print` process for a single turn. */
  private spawnTurn(session: BrainstormSession, prompt: string): number | undefined {
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
      { taskId: session.taskId, claudePath, cwd: session.cwd, continue: session.firstTurnDone },
      "brainstorm: spawning turn",
    );

    const proc = this.spawnFn(claudePath, args, {
      cwd: session.cwd,
      env: mergedEnv,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    session.process = proc;
    this.logger?.info({ taskId: session.taskId, pid: proc.pid }, "brainstorm: turn process spawned");

    proc.stdout!.on("data", (chunk: Buffer) => {
      session.stdoutBuffer += chunk.toString();

      // Split on newlines; last element may be incomplete
      const lines = session.stdoutBuffer.split("\n");
      session.stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const text = this.extractAssistantText(trimmed);
        if (text) {
          this.logger?.debug({ taskId: session.taskId, textLength: text.length }, "brainstorm: assistant text extracted");
          session.transcript.push(`[agent] ${text}`);
          this.broadcast(session.projectId, {
            type: "brainstorm_output",
            taskId: session.taskId,
            chunk: text,
          });
        }
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      this.logger?.warn({ taskId: session.taskId, stderr: text }, "brainstorm: stderr output");
    });

    proc.on("error", (err) => {
      this.logger?.error({ taskId: session.taskId, err }, "brainstorm: process error");
      session.process = null;
    });

    proc.on("close", (code, signal) => {
      // Flush any remaining buffered data
      if (session.stdoutBuffer.trim()) {
        const text = this.extractAssistantText(session.stdoutBuffer.trim());
        if (text) {
          session.transcript.push(`[agent] ${text}`);
          this.broadcast(session.projectId, {
            type: "brainstorm_output",
            taskId: session.taskId,
            chunk: text,
          });
        }
        session.stdoutBuffer = "";
      }

      this.logger?.info({ taskId: session.taskId, code, signal }, "brainstorm: turn completed");
      session.process = null;
      session.firstTurnDone = true;
    });

    return proc.pid;
  }

  /**
   * Parse a stream-json line and extract assistant text content.
   * Returns the text if the line contains assistant text, null otherwise.
   */
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
}
