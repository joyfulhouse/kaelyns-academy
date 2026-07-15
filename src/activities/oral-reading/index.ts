import type { OralReadingConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { OralReadingPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type OralReadingResponse,
} from "./logic";

/** Authored cold or modeled oral reading with privacy-safe speech verification. */
export const oralReading: ActivityType<OralReadingConfig, OralReadingResponse> = {
  kind: "oral-reading",
  label: "Read aloud",
  schema,
  responseSchema,
  Player: OralReadingPlayer,
  score,
  skillsAffected,
  validateGenerated,
};

export type { OralReadingResponse };
