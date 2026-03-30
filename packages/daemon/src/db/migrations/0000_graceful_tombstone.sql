CREATE TYPE "public"."agent_role" AS ENUM('cto', 'engineer', 'qa', 'researcher', 'planner', 'implementer', 'reviewer', 'verifier', 'referee', 'custom');--> statement-breakpoint
CREATE TYPE "public"."agent_status" AS ENUM('active', 'paused', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."brainstorm_status" AS ENUM('active', 'idle', 'ready', 'expired');--> statement-breakpoint
CREATE TYPE "public"."comment_type" AS ENUM('inline', 'system', 'verification', 'brainstorm');--> statement-breakpoint
CREATE TYPE "public"."complex_phase" AS ENUM('research', 'plan', 'implement', 'review');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('project', 'area', 'archive');--> statement-breakpoint
CREATE TYPE "public"."fact_category" AS ENUM('decision', 'status', 'milestone', 'issue', 'relationship', 'convention', 'observation');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."process_status" AS ENUM('running', 'completed', 'failed', 'crashed');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_column" AS ENUM('backlog', 'blocked', 'in_progress', 'review', 'verification', 'done');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('quick', 'complex', 'brainstorm');--> statement-breakpoint
CREATE TYPE "public"."verification_result" AS ENUM('pass', 'fail', 'partial');--> statement-breakpoint
CREATE TYPE "public"."wakeup_source" AS ENUM('timer', 'assignment', 'on_demand', 'automation');--> statement-breakpoint
CREATE TYPE "public"."wakeup_status" AS ENUM('queued', 'claimed', 'coalesced', 'deferred_issue_execution', 'skipped', 'budget_blocked');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"role" "agent_role" DEFAULT 'custom' NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"icon" text DEFAULT '🤖',
	"color" text DEFAULT '#888780',
	"model" text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	"effort" text,
	"max_turns" integer DEFAULT 25 NOT NULL,
	"allowed_tools" text[] DEFAULT '{}',
	"heartbeat_enabled" boolean DEFAULT false NOT NULL,
	"heartbeat_interval_sec" integer DEFAULT 0 NOT NULL,
	"wake_on_assignment" boolean DEFAULT true NOT NULL,
	"wake_on_on_demand" boolean DEFAULT true NOT NULL,
	"wake_on_automation" boolean DEFAULT true NOT NULL,
	"max_concurrent_runs" integer DEFAULT 1 NOT NULL,
	"last_heartbeat" timestamp with time zone,
	"can_assign_to" text[] DEFAULT '{}',
	"can_create_tasks" boolean DEFAULT false,
	"can_move_to" "task_column"[] DEFAULT '{}',
	"system_prompt" text DEFAULT '',
	"prompt_template" text DEFAULT '',
	"bootstrap_prompt_template" text DEFAULT '',
	"instructions_file_path" text,
	"research_prompt" text DEFAULT '',
	"plan_prompt" text DEFAULT '',
	"implement_prompt" text DEFAULT '',
	"review_prompt" text DEFAULT '',
	"mcp_tools" text[] DEFAULT '{}',
	"skill_paths" text[] DEFAULT '{}',
	"work_log_dir" text,
	"lessons_file" text,
	"adapter_type" text DEFAULT 'claude_local' NOT NULL,
	"adapter_config" jsonb DEFAULT '{}'::jsonb,
	"max_concurrent_tasks" integer DEFAULT 1,
	"max_concurrent_subagents" integer DEFAULT 3,
	"working_hours" text,
	"budget_limit_usd" real,
	"budget_spent_usd" real DEFAULT 0 NOT NULL,
	"budget_paused" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"env_vars" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_id_project_id_pk" PRIMARY KEY("id","project_id")
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
	"verification_required" boolean DEFAULT true,
	"budget_limit_usd" real,
	"budget_spent_usd" real DEFAULT 0 NOT NULL,
	"budget_paused" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
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
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '',
	"column" "task_column" DEFAULT 'backlog' NOT NULL,
	"task_type" "task_type" DEFAULT 'quick' NOT NULL,
	"assignee" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"complex_phase" "complex_phase",
	"research_output" text,
	"plan_output" text,
	"implementation_output" text,
	"review_output" text,
	"research_agent_id" text,
	"plan_agent_id" text,
	"implement_agent_id" text,
	"review_agent_id" text,
	"research_prompt_override" text,
	"plan_prompt_override" text,
	"implement_prompt_override" text,
	"review_prompt_override" text,
	"brainstorm_status" "brainstorm_status",
	"brainstorm_transcript" text,
	"brainstorm_session_pid" integer,
	"auto_commit" boolean DEFAULT false NOT NULL,
	"auto_pr" boolean DEFAULT true NOT NULL,
	"branch" text,
	"worktree_path" text,
	"verification_result" "verification_result",
	"verifier_report" text,
	"referee_verdict" text,
	"execution_run_id" text,
	"execution_agent_id" text,
	"execution_locked_at" timestamp with time zone,
	"mcp_tools" text[] DEFAULT '{}',
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_parent_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_id_tasks_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;