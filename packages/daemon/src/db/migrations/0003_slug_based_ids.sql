ALTER TABLE "projects" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_task_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "projects"
SET "key" = upper(substr(regexp_replace("slug", '[^a-zA-Z0-9]', '', 'g'), 1, 3))
WHERE "key" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_key_unique" UNIQUE("key");
