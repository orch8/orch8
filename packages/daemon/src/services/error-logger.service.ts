import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { errorLog } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { BroadcastService } from "./broadcast.service.js";
import type { NotificationService } from "./notification.service.js";

export type ErrorSeverity = "warn" | "error" | "fatal";
export type ErrorSource =
  | "daemon" | "api" | "ws" | "agent" | "provider" | "tool" | "heartbeat" | "chat"
  | "memory" | "budget" | "pipeline" | "scheduler" | "adapter" | "db" | "fs" | "config";

export interface ErrorLogInput {
  severity: ErrorSeverity;
  source: ErrorSource;
  code: string;
  message: string;
  err?: unknown;
  metadata?: Record<string, unknown>;
  projectId?: string;
  agentId?: string;
  taskId?: string;
  runId?: string;
  chatId?: string;
  requestId?: string;
  httpMethod?: string;
  httpPath?: string;
  httpStatus?: number;
  actorType?: "admin" | "agent" | "system";
  actorId?: string;
}

const REDACTED = "[REDACTED]";
const TRUNCATED = "\n[truncated]";
const SECRET_KEY_RE = /authorization|x-api-key|x-admin-token|x-agent-id|api_?key|apikey|token|bearer|secret|password/i;
const SECRET_VALUE_RES = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /(ANTHROPIC_API_KEY|OPENAI_API_KEY|CLAUDE_CODE_[A-Z0-9_]+)=\S+/gi,
];

export class ErrorLoggerService {
  constructor(
    private db: SchemaDb,
    private logger?: FastifyBaseLogger,
    private broadcast?: BroadcastService,
    private notifications?: NotificationService,
  ) {}

  setLogger(logger: FastifyBaseLogger) {
    this.logger = logger;
  }

  setNotificationService(notifications: NotificationService) {
    this.notifications = notifications;
  }

  async warn(source: ErrorSource, code: string, message: string, opts: Partial<ErrorLogInput> = {}) {
    await this.record({ ...opts, severity: "warn", source, code, message });
  }

  async error(source: ErrorSource, code: string, message: string, opts: Partial<ErrorLogInput> = {}) {
    await this.record({ ...opts, severity: "error", source, code, message });
  }

  async fatal(source: ErrorSource, code: string, message: string, opts: Partial<ErrorLogInput> = {}) {
    await this.record({ ...opts, severity: "fatal", source, code, message });
  }

  async record(input: ErrorLogInput): Promise<void> {
    const pinoLevel = input.severity === "warn" ? "warn" : "error";
    this.logger?.[pinoLevel]({ ...input, err: input.err }, input.message);

    const { stack, cause } = this.extractError(input.err);
    const message = this.capString(this.redactString(input.message), 2048);
    const cappedStack = stack ? this.capString(this.redactString(stack), 8192) : null;
    const metadata = this.cap(this.redact(input.metadata ?? {}));
    const fingerprint = this.computeFingerprint(input, message);
    const occurredAt = new Date();

    try {
      const [row] = await this.db
        .insert(errorLog)
        .values({
          projectId: input.projectId ?? null,
          agentId: input.agentId ?? null,
          taskId: input.taskId ?? null,
          runId: input.runId ?? null,
          chatId: input.chatId ?? null,
          requestId: input.requestId ?? null,
          severity: input.severity,
          source: input.source,
          code: input.code,
          message,
          stack: cappedStack,
          cause,
          metadata,
          httpMethod: input.httpMethod ?? null,
          httpPath: input.httpPath ?? null,
          httpStatus: input.httpStatus ?? null,
          actorType: input.actorType ?? null,
          actorId: input.actorId ?? null,
          fingerprint,
          occurredAt,
        })
        .onConflictDoUpdate({
          target: [errorLog.projectId, errorLog.fingerprint],
          set: {
            occurrences: sql`${errorLog.occurrences} + 1`,
            lastSeenAt: sql`now()`,
            resolvedAt: null,
            resolvedBy: null,
            message,
            stack: cappedStack,
            metadata,
            occurredAt,
          },
        })
        .returning({ id: errorLog.id, occurrences: errorLog.occurrences });

      if (row) {
        this.maybeBroadcast(input, row.id, row.occurrences, message);
        await this.maybeNotify(input, message);
      }
    } catch (dbErr) {
      this.logger?.error({ dbErr }, "ErrorLoggerService DB write failed");
    }
  }

  private extractError(err: unknown): { stack: string | null; cause: unknown } {
    if (!err) return { stack: null, cause: null };
    if (err instanceof Error) {
      return {
        stack: err.stack ?? null,
        cause: this.redact({
          name: err.name,
          message: err.message,
          cause: "cause" in err ? err.cause : undefined,
        }),
      };
    }
    return { stack: null, cause: this.redact(err) };
  }

  private computeFingerprint(input: ErrorLogInput, message: string): string {
    const scope = input.runId ?? input.taskId ?? "";
    return createHash("sha1")
      .update([input.source, input.code, this.normalizeMessage(message), scope].join("\0"))
      .digest("hex");
  }

  private normalizeMessage(message: string): string {
    return message
      .replace(/[a-z]+_[0-9a-f-]{8,}/gi, "ID")
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "UUID")
      .replace(/\d{4}-\d{2}-\d{2}(?:T[\d:.+-]+Z?)?/g, "DATE")
      .replace(/\d+/g, "N")
      .replace(/\s+/g, " ")
      .trim();
  }

  private redact<T>(value: T, seen = new WeakSet<object>()): T {
    if (typeof value === "string") return this.redactString(value) as T;
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return "[Circular]" as T;
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item, seen)) as T;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_RE.test(key) ? REDACTED : this.redact(child, seen);
    }
    return out as T;
  }

  private redactString(value: string): string {
    return SECRET_VALUE_RES.reduce((acc, re) => acc.replace(re, REDACTED), value);
  }

  private cap<T>(value: T): T {
    const json = JSON.stringify(value);
    if (json.length <= 32_768) return value;
    return {
      __truncated: true,
      preview: this.capString(json, 32_768),
    } as T;
  }

  private capString(value: string, max: number): string {
    return value.length > max ? `${value.slice(0, Math.max(0, max - TRUNCATED.length))}${TRUNCATED}` : value;
  }

  private maybeBroadcast(input: ErrorLogInput, errorId: string, occurrences: number, message: string): void {
    if (!input.projectId || input.severity === "warn") return;
    if (occurrences !== 1 && occurrences % 10 !== 0) return;
    this.broadcast?.daemonLog({
      level: input.severity,
      message,
      timestamp: new Date().toISOString(),
      source: input.source,
      code: input.code,
      errorId,
      projectId: input.projectId,
      runId: input.runId,
      taskId: input.taskId,
    });
  }

  private async maybeNotify(input: ErrorLogInput, message: string): Promise<void> {
    if (!input.projectId || !this.notifications) return;
    const typeByCode: Record<string, "agent_failure" | "budget_exceeded" | "budget_warning" | "stuck_task"> = {
      "agent.spawn_failed": "agent_failure",
      "heartbeat.process_lost": "agent_failure",
      "budget.blocked_at_claim": "budget_exceeded",
      "budget.auto_paused": "budget_warning",
      "scheduler.task_stuck": "stuck_task",
      "provider.auth_required": "agent_failure",
    };
    const type = typeByCode[`${input.source}.${input.code}`] ?? typeByCode[input.code];
    if (!type) return;
    try {
      await this.notifications.create({
        projectId: input.projectId,
        type,
        title: input.code,
        message,
        link: input.runId ? `/runs/${input.runId}` : undefined,
      });
    } catch (err) {
      this.logger?.error({ err }, "Failed to promote error log notification");
    }
  }
}
