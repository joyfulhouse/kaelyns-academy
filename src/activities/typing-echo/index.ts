import type { TypingEchoConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { TypingEchoPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type TypingEchoResponse,
} from "./logic";

/** Star Echo: flash a short letter sequence, hide it, then recall-type it from memory. */
export const typingEcho: ActivityType<TypingEchoConfig, TypingEchoResponse> = {
  kind: "typing-echo",
  label: "Star Echo",
  schema,
  responseSchema,
  Player: TypingEchoPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { TypingEchoResponse };
