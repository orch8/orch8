CREATE TABLE "activity_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" text NOT NULL,
	"agent_id" text,
	"task_id" text,
	"run_id" text,
	"message" text NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"entity_type" "entity_type" DEFAULT 'area' NOT NULL,
	"description" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"content" text NOT NULL,
	"category" "fact_category" NOT NULL,
	"source_agent" text NOT NULL,
	"source_task" text,
	"superseded_by" text,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"server_command" text NOT NULL,
	"server_args" text[] DEFAULT '{}',
	"env_vars" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"decision" text NOT NULL,
	"made_by" text NOT NULL,
	"context" text DEFAULT '',
	"binding" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_key" text NOT NULL,
	"adapter_type" text NOT NULL,
	"session_params_json" jsonb,
	"session_display_id" text,
	"last_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wakeup_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"source" "wakeup_source" NOT NULL,
	"trigger_detail" text,
	"reason" text,
	"payload" jsonb,
	"status" "wakeup_status" DEFAULT 'queued' NOT NULL,
	"coalesced_count" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text,
	"requested_by_actor_type" text,
	"requested_by_actor_id" text,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_facts" ADD CONSTRAINT "knowledge_facts_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_facts" ADD CONSTRAINT "knowledge_facts_source_task_tasks_id_fk" FOREIGN KEY ("source_task") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_decisions" ADD CONSTRAINT "shared_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sessions" ADD CONSTRAINT "task_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sessions" ADD CONSTRAINT "task_sessions_last_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD CONSTRAINT "wakeup_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD CONSTRAINT "wakeup_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD CONSTRAINT "wakeup_requests_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_entity_project_slug" ON "knowledge_entities" USING btree ("project_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_task_session" ON "task_sessions" USING btree ("agent_id","task_key","adapter_type");