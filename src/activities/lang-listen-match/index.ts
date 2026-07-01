import type { LangListenMatchConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { LangListenMatchPlayer } from "./Player";
import { schema, score, skillsAffected, type LangListenMatchResponse } from "./logic";

/** lang-listen-match plugin: hear a sound/word, tap the symbol or word that matches. */
export const langListenMatch: ActivityType<LangListenMatchConfig, LangListenMatchResponse> = {
  kind: "lang-listen-match",
  label: "Listen and find",
  schema,
  Player: LangListenMatchPlayer,
  score,
  skillsAffected,
};
export type { LangListenMatchResponse };
