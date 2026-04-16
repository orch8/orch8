import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { stringify as stringifyYaml } from "yaml";
import { DaemonConfigPatchSchema } from "@orch/shared";
import { loadGlobalConfig } from "../../config/loader.js";
import "../../types.js";

const CONFIG_PATH = join(homedir(), ".orch8", "config.yaml");

export async function daemonRoutes(app: FastifyInstance) {
  const startTime = Date.now();

  // GET /api/daemon/status
  app.get("/api/daemon/status", async (_request: FastifyRequest) => {
    const uptimeMs = Date.now() - startTime;
    const scheduler = app.schedulerService;

    return {
      status: "running",
      pid: process.pid,
      uptimeMs,
      uptimeFormatted: formatUptime(uptimeMs),
      tickIntervalMs: scheduler.intervalMs,
      processCount: scheduler.activeProcessCount,
      queueDepth: scheduler.queueDepth,
    };
  });

  // GET /api/daemon/config
  app.get("/api/daemon/config", async (_request: FastifyRequest) => {
    const globalConfig = loadGlobalConfig(CONFIG_PATH);
    return globalConfig;
  });

  // PATCH /api/daemon/config
  app.patch("/api/daemon/config", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = DaemonConfigPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.issues });
    }

    const { restart, ...configPatch } = parsed.data;
    const current = loadGlobalConfig(CONFIG_PATH);
    const merged = deepMerge(current, configPatch);
    writeFileSync(CONFIG_PATH, stringifyYaml(merged), "utf-8");

    if (restart) {
      setImmediate(() => {
        // process.emit("SIGTERM") is a no-op under systemd/launchd — those
        // process managers monitor the kernel signal table, not Node's
        // in-process EventEmitter. Sending an actual signal via
        // process.kill(pid, "SIGTERM") fires the real handler and is
        // observable by supervisors so the restart actually happens.
        process.kill(process.pid, "SIGTERM");
      });
    }

    return { ok: true, config: merged, restarting: !!restart };
  });

  // POST /api/daemon/restart
  app.post("/api/daemon/restart", async (_request: FastifyRequest) => {
    setImmediate(() => {
      // See note above on process.kill vs process.emit.
      process.kill(process.pid, "SIGTERM");
    });
    return { ok: true, message: "Restart initiated" };
  });
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === "object" &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof result[key] === "object" &&
        result[key] !== null
      ) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}
