import type { LangSymbolIntroConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { LangSymbolIntroPlayer } from "./Player";
import { schema, score, skillsAffected, type LangSymbolIntroResponse } from "./logic";

/** lang-symbol-intro plugin: meet new symbols (see + hear), then a quick check. */
export const langSymbolIntro: ActivityType<LangSymbolIntroConfig, LangSymbolIntroResponse> = {
  kind: "lang-symbol-intro",
  label: "Meet the symbols",
  schema,
  Player: LangSymbolIntroPlayer,
  score,
  skillsAffected,
};
export type { LangSymbolIntroResponse };
