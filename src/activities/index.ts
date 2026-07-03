/**
 * Activity-type registration entry point.
 *
 * Import this module once (the learner activity host does) to register every
 * activity-type plugin as a side effect. Each plugin lives under
 * src/activities/<kind>/ and is wired in below.
 *
 * Every kind in `ACTIVITY_CONFIG_SCHEMAS` now has a registered plugin here
 * (see src/activities/index.test.ts, which asserts no orphan kinds). A kind
 * landing ahead of its Player/logic module would fall back to the activity
 * host's "coming soon" placeholder (getActivityType(kind) returns undefined)
 * — that fallback stays as defensive code for future kinds, but is not
 * currently exercised.
 */
import { registerActivityType } from "@/content/registry";
import { phonicsWordbuild } from "./phonics-wordbuild";
import { sightwordGame } from "./sightword-game";
import { mathTenframe } from "./math-tenframe";
import { mathMoney } from "./math-money";
import { mathClock } from "./math-clock";
import { mathMeasure } from "./math-measure";
import { journalPrompt } from "./journal-prompt";
import { readingComprehension } from "./reading-comprehension";
import { mathArray } from "./math-array";
import { langSymbolIntro } from "./lang-symbol-intro";
import { langListenMatch } from "./lang-listen-match";
import { sortCategories } from "./sort-categories";
import { seqOrder } from "./seq-order";

let registered = false;

/** Registers all available activity-type plugins. Idempotent. */
export function registerActivityTypes(): void {
  if (registered) return;
  registered = true;
  registerActivityType(phonicsWordbuild);
  registerActivityType(sightwordGame);
  registerActivityType(mathTenframe);
  registerActivityType(mathMoney);
  registerActivityType(mathClock);
  registerActivityType(mathMeasure);
  registerActivityType(journalPrompt);
  registerActivityType(readingComprehension);
  registerActivityType(mathArray);
  registerActivityType(langSymbolIntro);
  registerActivityType(langListenMatch);
  registerActivityType(sortCategories);
  registerActivityType(seqOrder);
}

registerActivityTypes();

export { getActivityType, allActivityTypes, isActivityKindRegistered } from "@/content/registry";
