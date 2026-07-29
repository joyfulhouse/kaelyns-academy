import type { TypingWriteConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { TypingWritePlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type TypingWriteResponse,
} from "./logic";

/** Word Write: copy-typing ("see") or listen-and-type ("hear") full words/sentences. */
export const typingWrite: ActivityType<TypingWriteConfig, TypingWriteResponse> = {
  kind: "typing-write",
  label: "Word Write",
  schema,
  responseSchema,
  Player: TypingWritePlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { TypingWriteResponse };
