import type { JournalPromptConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { JournalPromptPlayer } from "./Player";
import { responseSchema, schema, score, skillsAffected, type JournalPromptResponse } from "./logic";

/** Journal participation: celebrate a bounded contribution without inferring mastery. */
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
