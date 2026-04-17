ALTER TABLE "projects" DROP COLUMN "worktree_dir";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "finish_strategy" text DEFAULT 'merge' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_finish_strategy_check" CHECK ("finish_strategy" IN ('pr','merge','none'));--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "worktree_path";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "branch";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "finish_strategy" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_finish_strategy_check" CHECK ("finish_strategy" IS NULL OR "finish_strategy" IN ('pr','merge','none'));
