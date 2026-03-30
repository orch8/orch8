import { eq } from "drizzle-orm";
import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { tasks, agents } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";

export type SpawnFn = typeof nodeSpawn;
export type BroadcastFn = (projectId: string, message: unknown) => void;

interface BrainstormSession {
  taskId: string;
  projectId: string;
  process: ChildProcess;
  transcript: string[];
  startedAt: Date;
}

export class BrainstormService {
  private sessions = new Map<string, BrainstormSession>();

  constructor(
    private db: SchemaDb,
    private broadcast: BroadcastFn,
    private spawnFn: SpawnFn = nodeSpawn,
  ) {}

  hasActiveSession(taskId: string): boolean {
    return this.sessions.has(taskId);
  }

  async startSession(taskId: string, cwd: string): Promise<void> {
    if (this.sessions.has(taskId)) {
      throw new Error(`Task ${taskId} already has an active session`);
    }

    const [task] = await this.db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new Error("Task not found");
    if (task.taskType !== "brainstorm") throw new Error("Task is not a brainstorm task");

    // Resolve agent config
    let model = "claude-sonnet-4-20250514";
    let maxTurns = 50;
    if (task.assignee) {
      const [agent] = await this.db
        .select()
        .from(agents)
        .where(eq(agents.id, task.assignee));
      if (agent) {
        model = agent.model;
        maxTurns = agent.maxTurns;
      }
    }

    const args = [
      "--print", "-",
      "--output-format", "stream-json",
      "--verbose",
      "--model", model,
      "--max-turns", String(maxTurns),
    ];

    const mergedEnv = { ...process.env };
    // Nesting guard removal
    delete mergedEnv.CLAUDECODE;
    delete mergedEnv.CLAUDE_CODE_ENTRYPOINT;
    delete mergedEnv.CLAUDE_CODE_SESSION;
    delete mergedEnv.CLAUDE_CODE_PARENT_SESSION;

    const proc = this.spawnFn("claude", args, {
      cwd,
      env: mergedEnv,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const session: BrainstormSession = {
      taskId,
      projectId: task.projectId,
      process: proc,
      transcript: [],
      startedAt: new Date(),
    };

    this.sessions.set(taskId, session);

    // Write initial prompt (task description)
    const initialPrompt = task.description || task.title;
    proc.stdin!.write(initialPrompt);
    session.transcript.push(`[user] ${initialPrompt}`);

    // Stream output to dashboard via WebSocket
    proc.stdout!.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      session.transcript.push(`[agent] ${text}`);
      this.broadcast(task.projectId, {
        type: "brainstorm_output",
        taskId,
        chunk: text,
      });
    });

    // Handle process exit — only clean up if session still exists
    // (markReady/killSession delete the session before killing, so the
    // close handler should not re-delete)
    proc.on("close", () => {
      this.sessions.delete(taskId);
    });

    // Update task with session PID
    await this.db.update(tasks).set({
      brainstormSessionPid: proc.pid ?? null,
      column: "in_progress",
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));
  }

  async sendMessage(taskId: string, content: string): Promise<void> {
    const session = this.sessions.get(taskId);
    if (!session) throw new Error("No active brainstorm session for this task");

    session.transcript.push(`[user] ${content}`);

    return new Promise<void>((resolve, reject) => {
      session.process.stdin!.write(`\n\n${content}`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async markReady(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId);
    if (!session) throw new Error("No active brainstorm session for this task");

    const transcript = session.transcript.join("\n\n");

    // Delete session BEFORE killing — the mock kill synchronously emits
    // "close", which would otherwise race with the close handler.
    this.sessions.delete(taskId);
    session.process.kill("SIGTERM");

    // Update task
    await this.db.update(tasks).set({
      brainstormStatus: "ready",
      brainstormTranscript: transcript,
      brainstormSessionPid: null,
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));
  }

  async killSession(taskId: string): Promise<void> {
    const session = this.sessions.get(taskId);
    if (!session) throw new Error("No active brainstorm session for this task");

    // Delete session BEFORE killing — same rationale as markReady.
    this.sessions.delete(taskId);
    session.process.kill("SIGTERM");

    await this.db.update(tasks).set({
      brainstormStatus: "expired",
      brainstormSessionPid: null,
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));
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
}
