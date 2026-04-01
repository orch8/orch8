CREATE TABLE "instruction_bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"project_id" text NOT NULL,
	"mode" text DEFAULT 'managed' NOT NULL,
	"root_path" text NOT NULL,
	"entry_file" text DEFAULT 'AGENTS.md' NOT NULL,
	"file_inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruction_bundles" ADD CONSTRAINT "instruction_bundles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instruction_bundles_agent_project_idx" ON "instruction_bundles" USING btree ("agent_id","project_id");