// server-only: this module must never be imported into a Client Component. It
// imports ONLY each risky kind's server-safe `logic.ts` (never its `index.ts` /
// `Player.tsx`), so the practice route handler that consumes it stays free of
// client components.
import type {
  ActivityKind,
  MathClockConfig,
  MathMeasureConfig,
  MathMoneyConfig,
  SeqOrderConfig,
  SortCategoriesConfig,
} from "@/content/activity-configs";
import { validateGenerated as clock } from "@/activities/math-clock/logic";
import { validateGenerated as measure } from "@/activities/math-measure/logic";
import { validateGenerated as money } from "@/activities/math-money/logic";
import { validateGenerated as seq } from "@/activities/seq-order/logic";
import { validateGenerated as sort } from "@/activities/sort-categories/logic";

/**
 * B3 §6: deterministic post-parse answer-key check for an AI-GENERATED config.
 * Returns null when the config is internally consistent (or the kind has no
 * answer-key to check beyond its zod schema), else a short reason. Run
 * server-side AFTER the zod parse; a failing item is dropped before it can reach
 * a child — a wrong generated answer key would mark a capable child wrong.
 *
 * Shaped as a narrow accessor rather than a `Partial<Record<ActivityKind, …>>`
 * map so the switch narrows each kind to its exact config type with no `any`/
 * `never` casts at the call site. `config` is `unknown` because the sole caller
 * ({@link generatePracticeItems}) holds a K-generic item whose type can't be
 * pinned to one kind; it has already been parsed against THIS kind's schema, so
 * the per-branch assertion restores the type each validator expects.
 */
export function validateGeneratedFor(kind: ActivityKind, config: unknown): string | null {
  switch (kind) {
    case "math-money":
      return money(config as MathMoneyConfig);
    case "math-clock":
      return clock(config as MathClockConfig);
    case "math-measure":
      return measure(config as MathMeasureConfig);
    case "sort-categories":
      return sort(config as SortCategoriesConfig);
    case "seq-order":
      return seq(config as SeqOrderConfig);
    default:
      return null;
  }
}
