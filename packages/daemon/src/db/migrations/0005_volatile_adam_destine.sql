ALTER TABLE "agents" ADD COLUMN "session_compaction_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "session_max_runs" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "session_max_input_tokens" integer;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "session_max_age_hours" integer;