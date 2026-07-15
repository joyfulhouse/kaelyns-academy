import type { ZodType } from "zod";
import { captureNonCritical } from "@/lib/capture";

/**
 * The shared shape of the AI-gate jsonb columns (enrollment `config` +
 * per-learner `settings`). The only field the §8 gate reads is `aiPractice`, so
 * the fail-closed fallback `{ aiPractice: false }` is a valid value for every
 * schema this helper accepts.
 */
type AiGated = { aiPractice?: boolean };

/**
 * Parse a stored AI-gate jsonb value defensively, failing CLOSED on corruption.
 * A legitimately empty/absent value stays its parsed default (default-allow — the
 * §8 gate only blocks on `aiPractice === false`). But a value that FAILS to parse
 * (e.g. a hand-edited row with `aiPractice: "false"`) could have been meant to
 * disable AI, and degrading it to `{}` would leave `aiPractice` undefined → the
 * gate would NOT block → fail-open. So on parse failure we log and return
 * `{ aiPractice: false }`, which blocks AI for that corrupt row.
 *
 * Shared by every enrollment-config / learner-settings read so this fail-closed
 * §8 default lives in exactly one place. The `context` is the human-readable
 * descriptor of what failed (e.g. `enrollment config (learner=… slug=…)`); it is
 * logged verbatim as `malformed <context>`.
 */
export function parseJsonbFailClosed<T extends AiGated>(
  schema: ZodType<T>,
  raw: unknown,
  context: string,
): T {
  return parseJsonbFailClosedWithValidity(schema, raw, context).data;
}

/** The gate variant preserves whether stored JSON parsed successfully so
 * non-AI authorization decisions (such as active-unit curation) cannot mistake
 * the AI-safe fallback object for a valid "all units" enrollment config. */
export function parseJsonbFailClosedWithValidity<T extends AiGated>(
  schema: ZodType<T>,
  raw: unknown,
  context: string,
): { data: T; valid: boolean } {
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return { data: parsed.data, valid: true };
  captureNonCritical(`malformed ${context}`, parsed.error);
  // The constraint guarantees `aiPractice?: boolean` is a valid field on T, so
  // the fail-closed value is a legitimate (if minimal) T for every accepted schema.
  return { data: { aiPractice: false } as T, valid: false };
}
