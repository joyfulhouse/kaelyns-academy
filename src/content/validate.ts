/**
 * Shared activity-config validation: the `ACTIVITY_CONFIG_SCHEMAS[kind]` lookup +
 * unknown-kind detection + `safeParse` that the runtime assembler, the admin
 * save path, and the editor's JSON gate all need. PURE: no I/O, no side effects.
 *
 * Callers map the discriminated result to their own behaviour (drop, throw, or a
 * form-level error) and own their user-facing message wording — this module only
 * owns the mechanical lookup/parse and the first-issue extraction helper.
 */
import type { z } from "zod";
import type { ActivityKind } from "./activity-configs";
import { ACTIVITY_CONFIG_SCHEMAS } from "./activity-configs";

export type ActivityConfigValidation =
  | { ok: true; data: unknown }
  | { ok: false; reason: "unknown-kind" }
  | { ok: false; reason: "invalid"; error: z.ZodError };

/**
 * Validate a raw config object against the schema for `kind`.
 *   - unknown `kind` → `{ ok: false, reason: "unknown-kind" }`
 *   - schema failure → `{ ok: false, reason: "invalid", error }` (the ZodError)
 *   - success        → `{ ok: true, data }` where `data` is the PARSED output
 *     (defaults applied), exactly what the runtime tree should carry.
 */
export function validateActivityConfig(
  kind: string,
  config: unknown,
): ActivityConfigValidation {
  const schema = ACTIVITY_CONFIG_SCHEMAS[kind as ActivityKind];
  if (schema === undefined) return { ok: false, reason: "unknown-kind" };

  const parsed = schema.safeParse(config);
  if (!parsed.success) return { ok: false, reason: "invalid", error: parsed.error };
  return { ok: true, data: parsed.data };
}

/**
 * The first Zod issue's message, optionally prefixed with its dotted path
 * (`"path: message"`). `fallback` is used only when the issue carries no message
 * — real ZodErrors always do, so it is purely defensive. Centralises the
 * `error.issues[0]?.message`/`path.join(".")` reach that the save and editor
 * paths each used to inline; the fallback wording and whether to show the path
 * stay with the caller (those legitimately differ between call sites).
 */
export function firstConfigIssueMessage(
  error: z.ZodError,
  options: { withPath?: boolean; fallback: string },
): string {
  const first = error.issues[0];
  const message = first?.message ?? options.fallback;
  if (!options.withPath) return message;
  const path = first?.path.join(".") ?? "";
  return path ? `${path}: ${message}` : message;
}
