import type { OralReadingConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { OralReadingPlayer } from "./Player";
import {
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type OralReadingResponse,
} from "./logic";

/** Authored listen-first oral reading with privacy-safe speech verification. */
export const oralReading: ActivityType<OralReadingConfig, OralReadingResponse> = {
  kind: "oral-reading",
  label: "Read aloud",
  schema,
  Player: OralReadingPlayer,
  score,
  skillsAffected,
  validateGenerated,
};

export type { OralReadingResponse };
