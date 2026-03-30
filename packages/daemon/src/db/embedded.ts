import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import path from "node:path";
import os from "node:os";
import net from "node:net";

export interface EmbeddedPgOptions {
  databaseDir?: string;
  port?: number;
  persistent?: boolean;
}

const DEFAULT_DATA_DIR = path.join(os.homedir(), ".orch8", "data", "pg");
const DEFAULT_PORT = 5433;
const DATABASE_NAME = "orchestrator";

let instance: EmbeddedPostgres | null = null;

async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Could not determine port")));
      }
    });
    server.on("error", reject);
  });
}

export async function startEmbeddedPostgres(
  options: EmbeddedPgOptions = {},
): Promise<string> {
  const {
    databaseDir = DEFAULT_DATA_DIR,
    port: requestedPort = DEFAULT_PORT,
    persistent = true,
  } = options;

  const port = requestedPort === 0 ? await findAvailablePort() : requestedPort;

  instance = new EmbeddedPostgres({
    databaseDir,
    port,
    persistent,
  });

  try {
    await instance.initialise();
  } catch (err: unknown) {
    // initialise throws if already initialised — that's fine for persistent mode
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("already exists")) {
      throw err;
    }
  }

  try {
    await instance.start();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("address already in use") ||
      message.includes("EADDRINUSE")
    ) {
      throw new Error(
        `Port ${port} is in use. Is another orch8 instance running?`,
      );
    }
    throw err;
  }

  // Create the orchestrator database if it doesn't exist.
  // Connect to the default 'postgres' database first.
  const adminUrl = `postgres://postgres:password@localhost:${port}/postgres`;
  const adminSql = postgres(adminUrl, { max: 1 });
  try {
    const existing = await adminSql`
      SELECT 1 FROM pg_database WHERE datname = ${DATABASE_NAME}
    `;
    if (existing.length === 0) {
      await adminSql.unsafe(`CREATE DATABASE ${DATABASE_NAME}`);
    }
  } finally {
    await adminSql.end();
  }

  return `postgres://postgres:password@localhost:${port}/${DATABASE_NAME}`;
}

export async function stopEmbeddedPostgres(): Promise<void> {
  if (instance) {
    await instance.stop();
    instance = null;
  }
}
