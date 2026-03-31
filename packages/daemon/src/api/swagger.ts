import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function registerSwagger(app: FastifyInstance) {
  const specPath = resolve(__dirname, "../../openapi.yaml");
  const spec = parseYaml(readFileSync(specPath, "utf-8"));

  await app.register(fastifySwagger, {
    mode: "static",
    specification: {
      document: spec,
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
    },
  });
}
