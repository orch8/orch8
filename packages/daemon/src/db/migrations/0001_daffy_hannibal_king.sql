ALTER TYPE "public"."pipeline_step_status" ADD VALUE 'awaiting_verification';--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD COLUMN "requires_verification" boolean DEFAULT false NOT NULL;