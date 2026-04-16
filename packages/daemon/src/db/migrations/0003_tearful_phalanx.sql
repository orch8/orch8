ALTER TABLE "agents" ADD COLUMN "agent_token_hash" text;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_agent_token_hash_unique" UNIQUE("agent_token_hash");--> statement-breakpoint
-- Backfill: mark each existing agent row with a unique placeholder hash
-- derived from its primary key. The value is NOT a valid SHA-256 of any
-- known raw token, so it cannot be matched via the Bearer path; callers
-- who need a working token for a legacy agent MUST call the rotation
-- endpoint to obtain one. We avoid pgcrypto (`gen_random_bytes` /
-- `sha256`) here because it is not always installed; `md5(random())`
-- from core gives enough entropy for a one-time placeholder that will
-- never collide across real SHA-256 hashes.
UPDATE "agents"
SET "agent_token_hash" = 'legacy_' || md5(random()::text || clock_timestamp()::text || id || project_id)
WHERE "agent_token_hash" IS NULL;
