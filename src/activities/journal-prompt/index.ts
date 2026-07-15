import type { JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { JournalPromptPlayer } from "./Player";
import { responseSchema, schema, score, skillsAffected, type JournalPromptResponse } from "./logic";

/** journal-prompt activity-type plugin: draw + write expression (always 3 stars). */
export const journalPrompt: ActivityType<JournalPromptConfig, JournalPromptResponse> = {
  kind: "journal-prompt",
  label: "Draw & write",
  schema,
  responseSchema,
  Player: JournalPromptPlayer,
  score,
  skillsAffected,
};
export type { JournalPromptResponse };
