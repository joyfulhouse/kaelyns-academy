import type { TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { TypingKeysPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type TypingKeysResponse,
} from "./logic";

/** Key Camp: a calm, clockless drill on one set of keys. */
export const typingKeys: ActivityType<TypingKeysConfig, TypingKeysResponse> = {
  kind: "typing-keys",
  label: "Key Camp",
  schema,
  responseSchema,
  Player: TypingKeysPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { TypingKeysResponse };
