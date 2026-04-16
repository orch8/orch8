/**
 * Run-related API response shapes.
 *
 * The `RUN_EVENT_TYPES` tuple is the single source of truth for the
 * `eventType` discriminator. The daemon's adapter/tool-mapper.ts emits these
 * values; the Drizzle `run_events` table stores them as free-form `text` (see
 * packages/shared/src/db/schema.ts → runEvents). Exporting the tuple lets
 * consumers narrow without hand-maintaining parallel unions on either side.
 */

export const RUN_EVENT_TYPES = [
  "init",
  "tool_use",
  "tool_result",
  "assistant_text",
  "result",
  "error",
] as const;

export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/**
 * Shape returned by GET /api/runs/:id/events, after JSON serialization.
 * Drizzle `Date` columns (timestamp, createdAt) arrive as ISO strings on the
 * wire.
 */
export interface RunEvent {
  id: string;
  runId: string;
  projectId: string;
  seq: number;
  timestamp: string;
  eventType: RunEventType;
  toolName: string | null;
  summary: string;
  payload: unknown;
  createdAt: string;
}

/** Shape returned by GET /api/runs/:id/log. */
export interface RunLog {
  content: string;
  store: string;
  bytes: number;
}
