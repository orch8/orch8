CREATE TYPE "public"."error_severity" AS ENUM('warn', 'error', 'fatal');--> statement-breakpoint
CREATE TYPE "public"."error_source" AS ENUM('daemon', 'api', 'ws', 'agent', 'provider', 'tool', 'heartbeat', 'chat', 'memory', 'budget', 'pipeline', 'scheduler', 'adapter', 'db', 'fs', 'config');--> statement-breakpoint
CREATE TABLE "error_log" (
  "id" text PRIMARY KEY NOT NULL,
  "project_id" text,
  "agent_id" text,
  "task_id" text,
  "run_id" text,
  "chat_id" text,
  "request_id" text,
  "severity" "error_severity" NOT NULL,
  "source" "error_source" NOT NULL,
  "code" text NOT NULL,
  "message" text NOT NULL,
  "stack" text,
  "cause" jsonb,
  "metadata" jsonb DEFAULT '{}',
  "http_method" text,
  "http_path" text,
  "http_status" integer,
  "actor_type" text,
  "actor_id" text,
  "fingerprint" text NOT NULL,
  "occurrences" integer DEFAULT 1 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "err_project_time_idx" ON "error_log" USING btree ("project_id","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "err_severity_idx" ON "error_log" USING btree ("severity","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "err_source_time_idx" ON "error_log" USING btree ("source","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "err_run_idx" ON "error_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "err_task_idx" ON "error_log" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "err_chat_idx" ON "error_log" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "err_request_idx" ON "error_log" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "err_fingerprint_uniq" ON "error_log" USING btree ("project_id","fingerprint");
