/**
 * Shape returned by GET /api/daemon/status (see
 * packages/daemon/src/api/routes/daemon.ts). Kept here because the daemon is
 * the producer and both packages need a single source of truth.
 */
export interface DaemonStatus {
  status: string;
  pid: number;
  uptimeMs: number;
  uptimeFormatted: string;
  tickIntervalMs: number;
  processCount: number;
  queueDepth: number;
}
