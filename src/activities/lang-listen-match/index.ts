import type { LangListenMatchConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { LangListenMatchPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type LangListenMatchResponse,
} from "./logic";

/** lang-listen-match plugin: hear a sound/word, tap the symbol or word that matches. */
export const langListenMatch: ActivityType<LangListenMatchConfig, LangListenMatchResponse> = {
  kind: "lang-listen-match",
  label: "Listen and find",
  schema,
  responseSchema,
  Player: LangListenMatchPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { LangListenMatchResponse };
