import type { ReadingComprehensionConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { ReadingComprehensionPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  type ReadingComprehensionResponse,
} from "./logic";

/** reading-comprehension activity-type plugin: read a passage, tap the answers,
 *  retell out loud. The one kid-surface activity that measures understanding. */
export const readingComprehension: ActivityType<
  ReadingComprehensionConfig,
  ReadingComprehensionResponse
> = {
  kind: "reading-comprehension",
  label: "Read & answer",
  schema,
  responseSchema,
  Player: ReadingComprehensionPlayer,
  score,
  skillsAffected,
};
export type { ReadingComprehensionResponse };
