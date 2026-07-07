import type { MathClockConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathClockPlayer } from "./Player";
import {
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type MathClockResponse,
} from "./logic";

/** math-clock activity-type plugin: read an analog clock / set the hands, to the half-hour. */
export const mathClock: ActivityType<MathClockConfig, MathClockResponse> = {
  kind: "math-clock",
  label: "Clock",
  schema,
  Player: MathClockPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { MathClockResponse };
