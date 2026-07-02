import type { MathClockConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathClockPlayer } from "./Player";
import { schema, score, skillsAffected, type MathClockResponse } from "./logic";

/** math-clock activity-type plugin: read or set a clock. */
export const mathClock: ActivityType<MathClockConfig, MathClockResponse> = {
  kind: "math-clock",
  label: "Clock",
  schema,
  Player: MathClockPlayer,
  score,
  skillsAffected,
};
export type { MathClockResponse };
