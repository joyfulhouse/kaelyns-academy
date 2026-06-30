/**
 * Shared bootstrap for the standalone raw-postgres CLI scripts (migrate.ts,
 * seed-admin-roles.ts, grant-admin.ts). These are `bun scripts/*.ts` entrypoints,
 * NOT part of the Next app, so opening a connection at script scope here is
 * intentional — the "never connect at module top-level" build-safety rule is about
 * the app, not these one-shot CLIs.
 *
 * Captures the bootstrap envelope every script repeated: the $DATABASE_URL guard,
 * a single-connection `postgres()` client whose session GUCs bound every statement
 * (so a contended lock or runaway statement fails fast instead of hanging), and
 * the try/catch → graceful sql.end() + deterministic process.exit wrapper that
 * lets a deploy gate trust the exit code. The per-script SQL logic stays in each
 * script.
 */
import postgres from "postgres";

/** The postgres.js client type, shared so scripts needn't re-derive it. */
export type Sql = ReturnType<typeof postgres>;

/**
 * Default statement/lock bounds, matching seed-admin-roles.ts + grant-admin.ts. A
 * script with a legitimately long operation (migrate.ts's DDL) overrides
 * statementTimeoutMs; tune up there (not by removing the bound).
 */
const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

export interface CliDbOptions {
  /** Per-statement bound (ms). Defaults to 30s. */
  statementTimeoutMs?: number;
  /** Lock-wait bound (ms). Defaults to 10s. */
  lockTimeoutMs?: number;
}

/**
 * Read $DATABASE_URL — exiting 1 with a `[label]`-prefixed error if unset — and
 * open a single-connection postgres client whose connection GUCs bound every
 * statement it runs.
 */
export function openCliDb(label: string, options: CliDbOptions = {}): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`[${label}] DATABASE_URL is not set`);
    process.exit(1);
  }
  return postgres(url, {
    max: 1,
    // Sent as session GUCs on connect, so they bound every statement run on it.
    connection: {
      lock_timeout: options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
      statement_timeout: options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    },
  });
}

/**
 * Open the CLI db, run `fn(sql)`, then close the pool and exit with a deterministic
 * code: on success, exit `(code returned by fn) ?? 0`; on throw, log
 * `[label] FAILED: …`, best-effort close, and exit 1. Returning a non-zero code is
 * the clean "expected failure" path (e.g. grant-admin's unknown user id) — it still
 * closes gracefully and skips the FAILED log, unlike a throw.
 */
export async function runCli(
  label: string,
  fn: (sql: Sql) => Promise<number | void>,
  options: CliDbOptions = {},
): Promise<never> {
  const sql = openCliDb(label, options);
  try {
    const code = (await fn(sql)) ?? 0;
    await sql.end();
    process.exit(code);
  } catch (err) {
    console.error(`[${label}] FAILED:`, err);
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(1);
  }
}
