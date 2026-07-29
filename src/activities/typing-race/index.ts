import type { TypingRaceConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { TypingRacePlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type TypingRaceResponse,
} from "./logic";

/** Rocket Race: full-word rate typing against a friendly pace comet. */
export const typingRace: ActivityType<TypingRaceConfig, TypingRaceResponse> = {
  kind: "typing-race",
  label: "Rocket Race",
  schema,
  responseSchema,
  Player: TypingRacePlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { TypingRaceResponse };
