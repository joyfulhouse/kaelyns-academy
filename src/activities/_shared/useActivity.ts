"use client";

import { useMemo } from "react";
import type { ZodType } from "zod";

/**
 * Parse + memoize an activity's authored config against its schema. Every Player
 * starts the same way: `schema.parse(config)` validates the authored / AI-
 * generated config server-and-client-side (config is untrusted until parsed —
 * spec §8) and resolves zod defaults, memoized so the parse runs only when the
 * config object identity changes.
 */
export function useActivity<T>(schema: ZodType<T>, config: unknown): T {
  return useMemo(() => schema.parse(config), [schema, config]);
}
