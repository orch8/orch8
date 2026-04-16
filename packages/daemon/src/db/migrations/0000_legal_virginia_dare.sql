CREATE TYPE "public"."agent_role" AS ENUM('cto', 'engineer', 'qa', 'researcher', 'planner', 'implementer', 'reviewer', 'verifier', 'referee', 'custom');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."brainstorm_status" AS ENUM('active', 'idle', 'ready', 'expired');--> statement-breakpoint
CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_message_status" AS ENUM('streaming', 'complete', 'error');--> statement-breakpoint
CREATE TYPE "public"."comment_type" AS ENUM('inline', 'system', 'verification', 'brainstorm');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('project', 'area', 'archive');--> statement-breakpoint
CREATE TYPE "public"."fact_category" AS ENUM('decision', 'status', 'milestone', 'issue', 'relationship', 'convention', 'observation');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('budget_warning', 'budget_exceeded', 'agent_failure', 'brainstorm_ready', 'task_completed', 'stuck_task');--> statement-breakpoint
CREATE TYPE "public"."process_status" AS ENUM('running', 'completed', 'failed', 'crashed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_column" AS ENUM('backlog', 'blocked', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('quick', 'brainstorm');--> statement-breakpoint
CREATE TYPE "public"."wakeup_source" AS ENUM('timer', 'assignment', 'on_demand', 'automation');--> statement-breakpoint
CREATE TYPE "public"."wakeup_status" AS ENUM('queued', 'claimed', 'coalesced', 'deferred_issue_execution', 'skipped', 'budget_blocked');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('pending', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pipeline_step_status" AS ENUM('pending', 'running', 'completed', 'skipped', 'failed', 'awaiting_verification');--> statement-breakpoint
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
CREATE TABLE "agents" (
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"role" "agent_role" DEFAULT 'custom' NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"icon" text DEFAULT '🤖',
	"color" text DEFAULT '#888780',
	"model" text DEFAULT 'claude-opus-4-7' NOT NULL,
	"effort" text,
	"max_turns" integer DEFAULT 180 NOT NULL,
	"allowed_tools" text[] DEFAULT '{}',
	"heartbeat_enabled" boolean DEFAULT false NOT NULL,
	"heartbeat_interval_sec" integer DEFAULT 0 NOT NULL,
	"session_compaction_enabled" boolean DEFAULT false,
	"session_max_runs" integer,
	"session_max_input_tokens" integer,
	"session_max_age_hours" integer,
	"wake_on_assignment" boolean DEFAULT true NOT NULL,
	"wake_on_on_demand" boolean DEFAULT true NOT NULL,
	"wake_on_automation" boolean DEFAULT true NOT NULL,
	"max_concurrent_runs" integer DEFAULT 1 NOT NULL,
	"last_heartbeat" timestamp with time zone,
	"can_assign_to" text[] DEFAULT '{}',
	"can_create_tasks" boolean DEFAULT false,
	"can_move_to" "task_column"[] DEFAULT '{}',
	"mcp_tools" text[] DEFAULT '{}',
	"skill_paths" text[] DEFAULT '{}',
	"desired_skills" text[],
	"work_log_dir" text,
	"lessons_file" text,
	"adapter_type" text DEFAULT 'claude_local' NOT NULL,
	"adapter_config" jsonb DEFAULT '{}'::jsonb,
	"max_concurrent_tasks" integer DEFAULT 1,
	"max_concurrent_subagents" integer DEFAULT 3,
	"working_hours" text,
	"auto_pause_threshold" integer,
	"budget_limit_usd" real,
	"budget_spent_usd" real DEFAULT 0 NOT NULL,
	"budget_paused" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"env_vars" jsonb DEFAULT '{}'::jsonb,
	"agent_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_id_project_id_pk" PRIMARY KEY("id","project_id"),
	CONSTRAINT "agents_agent_token_hash_unique" UNIQUE("agent_token_hash")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_invoked" text,
	"run_id" text,
	"status" "chat_message_status" DEFAULT 'complete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"type" "comment_type" DEFAULT 'inline' NOT NULL,
	"line_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "heartbeat_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"invocation_source" "wakeup_source" NOT NULL,
	"trigger_detail" text,
	"status" "run_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"process_pid" integer,
	"process_started_at" timestamp with time zone,
	"exit_code" integer,
	"signal" text,
	"error" text,
	"error_code" text,
	"usage_json" jsonb,
	"result_json" jsonb,
	"cost_usd" real,
	"billing_type" text,
	"model" text,
	"session_id_before" text,
	"session_id_after" text,
	"log_store" text,
	"log_ref" text,
	"log_bytes" integer,
	"context_snapshot" jsonb,
	"parent_run_id" text,
	"retry_of_run_id" text,
	"process_loss_retry_count" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_skills" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"markdown" text NOT NULL,
	"source_type" text DEFAULT 'local_path' NOT NULL,
	"source_locator" text,
	"trust_level" text DEFAULT 'markdown_only' NOT NULL,
	"file_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '',
	"home_dir" text NOT NULL,
	"worktree_dir" text NOT NULL,
	"repo_url" text,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"default_model" text,
	"default_max_turns" integer,
	"budget_limit_usd" real,
	"budget_spent_usd" real DEFAULT 0 NOT NULL,
	"budget_paused" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"project_id" text NOT NULL,
	"seq" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"event_type" text NOT NULL,
	"tool_name" text,
	"summary" text NOT NULL,
	"payload" jsonb,
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
CREATE TABLE "task_dependencies" (
	"task_id" text NOT NULL,
	"depends_on_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_task_id_depends_on_id_pk" PRIMARY KEY("task_id","depends_on_id"),
	CONSTRAINT "no_self_dep" CHECK ("task_dependencies"."task_id" != "task_dependencies"."depends_on_id")
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
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"column" "task_column" DEFAULT 'backlog' NOT NULL,
	"task_type" "task_type" DEFAULT 'quick' NOT NULL,
	"assignee" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"brainstorm_status" "brainstorm_status",
	"brainstorm_transcript" text,
	"brainstorm_session_pid" integer,
	"auto_commit" boolean DEFAULT false NOT NULL,
	"auto_pr" boolean DEFAULT true NOT NULL,
	"branch" text,
	"worktree_path" text,
	"execution_run_id" text,
	"execution_agent_id" text,
	"execution_locked_at" timestamp with time zone,
	"mcp_tools" text[] DEFAULT '{}',
	"retry_count" integer DEFAULT 0 NOT NULL,
	"pipeline_id" text,
	"pipeline_step_id" text,
	"linked_issue_ids" text[],
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
	"comment_id" text,
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
CREATE TABLE "pipeline_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"order" integer NOT NULL,
	"label" text NOT NULL,
	"task_id" text,
	"agent_id" text,
	"prompt_override" text,
	"requires_verification" boolean DEFAULT false NOT NULL,
	"output_file_path" text,
	"output_summary" text,
	"status" "pipeline_step_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"is_default" boolean DEFAULT false NOT NULL,
	"steps" jsonb NOT NULL,
	"created_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"template_id" text,
	"name" text NOT NULL,
	"status" "pipeline_status" DEFAULT 'pending' NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_parent_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entities" ADD CONSTRAINT "knowledge_entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_facts" ADD CONSTRAINT "knowledge_facts_entity_id_knowledge_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."knowledge_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_facts" ADD CONSTRAINT "knowledge_facts_source_task_tasks_id_fk" FOREIGN KEY ("source_task") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_decisions" ADD CONSTRAINT "shared_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_id_tasks_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sessions" ADD CONSTRAINT "task_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_sessions" ADD CONSTRAINT "task_sessions_last_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("last_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD CONSTRAINT "wakeup_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD CONSTRAINT "wakeup_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD CONSTRAINT "wakeup_requests_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_templates" ADD CONSTRAINT "pipeline_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_template_id_pipeline_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pipeline_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_chat_created_idx" ON "chat_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "chats_project_last_msg_idx" ON "chats" USING btree ("project_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chats_project_archived_idx" ON "chats" USING btree ("project_id","archived");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_entity_project_slug" ON "knowledge_entities" USING btree ("project_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "project_skills_project_slug_idx" ON "project_skills" USING btree ("project_id","slug");--> statement-breakpoint
CREATE INDEX "run_events_run_id_seq_idx" ON "run_events" USING btree ("run_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_task_session" ON "task_sessions" USING btree ("agent_id","task_key","adapter_type");--> statement-breakpoint
CREATE INDEX "pipeline_steps_pipeline_id_idx" ON "pipeline_steps" USING btree ("pipeline_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_steps_pipeline_order_idx" ON "pipeline_steps" USING btree ("pipeline_id","order");--> statement-breakpoint
CREATE INDEX "pipeline_steps_task_id_idx" ON "pipeline_steps" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "pipelines_project_id_idx" ON "pipelines" USING btree ("project_id");