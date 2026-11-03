import { vi } from "vitest";
import { buildServer, type ServerOptions } from "../../server.js";
import { SchedulerService } from "../../services/scheduler.service.js";
import { ChatService } from "../../services/chat.service.js";
import { ErrorLoggerService } from "../../services/error-logger.service.js";
import { trackAsyncMethod } from "./async-work.js";

/** Test-only ownership of startup work not exposed by app.initPromise. */
export function buildStartupTestServer(options: ServerOptions) {
  const work = [
    trackAsyncMethod(SchedulerService.prototype, "resumeInterruptedRuns"),
    trackAsyncMethod(ChatService.prototype, "reapOrphanedChatMessages"),
    trackAsyncMethod(ErrorLoggerService.prototype, "record"),
  ];
  let app: ReturnType<typeof buildServer>;
  try { app = buildServer(options); }
  catch (error) {
    work.forEach((item) => item.restore());
    throw error;
  }
  const errors = vi.spyOn(app.log, "error"); // Call through: diagnostics stay visible.
  // These fixtures exercise startup and HTTP routes, not periodic scheduling.
  // Stop producers before any await; detached startup calls still run for real.
  app.schedulerService.stop();
  async function join() {
    const results = await Promise.allSettled([
      app.initPromise,
      ...work.map((item) => item.drain()),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    if (rejected.length || errors.mock.calls.length) {
      throw new AggregateError(
        rejected.map((result) => result.reason),
        `Unexpected startup errors: ${JSON.stringify(errors.mock.calls)}`,
      );
    }
  }
  let closing: Promise<void> | undefined;
  return {
    app,
    async ready() {
      // Join startup even if Fastify readiness rejects.
      try { await app.ready(); } finally { await join(); }
    },
    close() {
      return closing ??= (async () => {
        app.schedulerService.stop();
        const failures: unknown[] = [];
        try { await join(); }
        catch (error) { failures.push(error); }
        try { await app.close(); }
        catch (error) { failures.push(error); }
        finally {
          work.forEach((item) => item.restore());
          errors.mockRestore();
        }
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1) throw new AggregateError(failures, "Startup join and app close failed");
      })();
    },
  };
}
