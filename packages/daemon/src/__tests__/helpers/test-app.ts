import type { FastifyInstance } from "fastify";
import type { SchemaDb } from "../../types.js";
import type { ErrorLogInput, ErrorLoggerService } from "../../services/error-logger.service.js";
import { BroadcastService } from "../../services/broadcast.service.js";
import { ProjectService } from "../../services/project.service.js";

export function decorateTestErrorLogger(app: FastifyInstance): void {
  if (app.hasDecorator("errorLogger")) return;

  const errorLogger = {
    record: async (_input: ErrorLogInput) => {},
    warn: async () => {},
    error: async () => {},
    fatal: async () => {},
    setLogger: () => {},
    setNotificationService: () => {},
  } as unknown as ErrorLoggerService;

  app.decorate("errorLogger", errorLogger);
}

export function decorateTestApp(app: FastifyInstance, db: SchemaDb): void {
  if (!app.hasDecorator("db")) {
    app.decorate("db", db);
  }

  if (!app.hasDecorator("projectService")) {
    app.decorate("projectService", new ProjectService(db));
  }

  if (!app.hasDecorator("broadcastService")) {
    app.decorate("broadcastService", new BroadcastService());
  }

  decorateTestErrorLogger(app);
}
