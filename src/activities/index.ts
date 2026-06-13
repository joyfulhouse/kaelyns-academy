/**
 * Activity-type registration entry point.
 *
 * Import this module once (the learner activity host does) to register every
 * activity-type plugin as a side effect. Each plugin lives under
 * src/activities/<kind>/ and is wired in below as it lands.
 *
 * Until a plugin is registered, the activity host renders a friendly
 * "coming soon" placeholder (getActivityType(kind) returns undefined), so the
 * learner surface and the activity plugins can be built independently.
 */
import { registerActivityType, type RegisteredActivityType } from "@/content/registry";
import { phonicsWordbuild } from "./phonics-wordbuild";
import { sightwordGame } from "./sightword-game";
import { mathTenframe } from "./math-tenframe";
import { journalPrompt } from "./journal-prompt";
import { readingComprehension } from "./reading-comprehension";
import { mathArray } from "./math-array";

let registered = false;

/** Registers all available activity-type plugins. Idempotent. */
export function registerActivityTypes(): void {
  if (registered) return;
  registered = true;
  registerActivityType(phonicsWordbuild);
  registerActivityType(sightwordGame);
  registerActivityType(mathTenframe);
  registerActivityType(journalPrompt);
  registerActivityType(readingComprehension);
  registerActivityType(mathArray);
}

registerActivityTypes();

/** Re-exported for convenience so the host can import from one place. */
export type { RegisteredActivityType };
export { getActivityType, allActivityTypes, isActivityKindRegistered } from "@/content/registry";
