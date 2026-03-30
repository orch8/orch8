import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../shared/src/db/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://orchestrator:orchestrator@localhost:5432/orchestrator",
  },
});
