import type { TypingCatchConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { TypingCatchPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type TypingCatchResponse,
} from "./logic";

/** Star Catch: a timed round with three hearts — the one sanctioned fail state. */
export const typingCatch: ActivityType<TypingCatchConfig, TypingCatchResponse> = {
  kind: "typing-catch",
  label: "Star Catch",
  schema,
  responseSchema,
  Player: TypingCatchPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { TypingCatchResponse };
