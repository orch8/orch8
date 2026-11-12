CREATE TABLE "pipeline_test_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "pipeline_id" text NOT NULL REFERENCES "pipelines"("id") ON DELETE cascade,
  "repository" text NOT NULL,
  "triggered_by" text DEFAULT 'operator' NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "pipeline_test_runs_latest_idx" ON "pipeline_test_runs" ("pipeline_id", "created_at");
