-- Fix-F B3: enforce at most ONE published version per program.
-- Partial unique index on program_version(program_id) WHERE status = 'published'.
-- Hand-written: drizzle-kit can't express a partial (WHERE) unique index from the
-- schema. Expand-only / backward-compatible — the seed publishes exactly one
-- version per program, and publishVersion archives the prior published version
-- before publishing the next (Fix-F B1), so existing data already satisfies it.
CREATE UNIQUE INDEX IF NOT EXISTS "program_one_published_uq" ON "program_version" ("program_id") WHERE "status" = 'published';
