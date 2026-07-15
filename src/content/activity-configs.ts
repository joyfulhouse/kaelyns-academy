/**
 * Stable public entry point for every activity config contract.
 *
 * Each schema lives beside its activity kind so independent lesson worktrees can
 * evolve one contract without colliding in this aggregator.
 */

import { journalPromptConfig } from "./activity-configs/journal-prompt";
import { langListenMatchConfig } from "./activity-configs/lang-listen-match";
import { langSymbolIntroConfig } from "./activity-configs/lang-symbol-intro";
import { mathArrayConfig } from "./activity-configs/math-array";
import { mathClockConfig } from "./activity-configs/math-clock";
import { mathFractionBarConfig } from "./activity-configs/math-fraction-bar";
import { mathMeasureConfig } from "./activity-configs/math-measure";
import { mathMoneyConfig } from "./activity-configs/math-money";
import { mathTenframeConfig } from "./activity-configs/math-tenframe";
import { oralReadingConfig } from "./activity-configs/oral-reading";
import { phonicsWordbuildConfig } from "./activity-configs/phonics-wordbuild";
import { readingComprehensionConfig } from "./activity-configs/reading-comprehension";
import { seqOrderConfig } from "./activity-configs/seq-order";
import { sightwordGameConfig } from "./activity-configs/sightword-game";
import { sortCategoriesConfig } from "./activity-configs/sort-categories";

export * from "./activity-configs/journal-prompt";
export * from "./activity-configs/lang-listen-match";
export * from "./activity-configs/lang-symbol-intro";
export * from "./activity-configs/math-array";
export * from "./activity-configs/math-clock";
export * from "./activity-configs/math-fraction-bar";
export * from "./activity-configs/math-measure";
export * from "./activity-configs/math-money";
export * from "./activity-configs/math-tenframe";
export * from "./activity-configs/oral-reading";
export * from "./activity-configs/phonics-wordbuild";
export * from "./activity-configs/reading-comprehension";
export * from "./activity-configs/seq-order";
export * from "./activity-configs/sightword-game";
export * from "./activity-configs/sort-categories";

export const ACTIVITY_CONFIG_SCHEMAS = {
  "phonics-wordbuild": phonicsWordbuildConfig,
  "sightword-game": sightwordGameConfig,
  "math-tenframe": mathTenframeConfig,
  "journal-prompt": journalPromptConfig,
  "reading-comprehension": readingComprehensionConfig,
  "math-array": mathArrayConfig,
  "lang-symbol-intro": langSymbolIntroConfig,
  "lang-listen-match": langListenMatchConfig,
  "math-clock": mathClockConfig,
  "math-fraction-bar": mathFractionBarConfig,
  "math-money": mathMoneyConfig,
  "math-measure": mathMeasureConfig,
  "sort-categories": sortCategoriesConfig,
  "seq-order": seqOrderConfig,
  "oral-reading": oralReadingConfig,
} as const;

export type ActivityKind = keyof typeof ACTIVITY_CONFIG_SCHEMAS;
