-- Expand-only (P4). Idempotent so it is safe to pre-apply in-cluster before the
-- gate code deploys (lockout-proof rollout) and safe for the migrate initContainer
-- to re-run. Matches the house style (cf. 0006).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;