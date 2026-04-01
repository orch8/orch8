ALTER TABLE "tasks" ADD COLUMN "linked_issue_ids" text[];--> statement-breakpoint
ALTER TABLE "wakeup_requests" ADD COLUMN "comment_id" text;