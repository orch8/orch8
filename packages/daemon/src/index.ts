import { buildServer } from "./server.js";
import { DEFAULT_PORT, DEFAULT_HOST } from "@orch/shared";

const server = buildServer();

try {
  await server.listen({
    port: Number(process.env.ORCH_PORT ?? DEFAULT_PORT),
    host: process.env.ORCH_HOST ?? DEFAULT_HOST,
  });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
