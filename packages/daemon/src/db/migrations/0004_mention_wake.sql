ALTER TYPE "public"."wakeup_source" ADD VALUE 'mention';--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "mentions" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "mentions" text[] DEFAULT '{}' NOT NULL;
