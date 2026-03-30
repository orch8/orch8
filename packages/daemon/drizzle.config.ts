import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../shared/src/db/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:5433/orchestrator",
  },
});
