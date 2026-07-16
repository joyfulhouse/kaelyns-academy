import type { PhonicsWordbuildConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { PhonicsWordbuildPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type PhonicsWordbuildResponse,
} from "./logic";

/** phonics-wordbuild activity-type plugin: build the spoken/pictured word from tiles. */
export const phonicsWordbuild: ActivityType<PhonicsWordbuildConfig, PhonicsWordbuildResponse> = {
  kind: "phonics-wordbuild",
  label: "Build a word",
  schema,
  responseSchema,
  Player: PhonicsWordbuildPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { PhonicsWordbuildResponse };
