import type { MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathMeasurePlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type MathMeasureResponse,
} from "./logic";

/** math-measure activity-type plugin: compare items by size, or count ruler units. */
export const mathMeasure: ActivityType<MathMeasureConfig, MathMeasureResponse> = {
  kind: "math-measure",
  label: "Measure",
  schema,
  responseSchema,
  Player: MathMeasurePlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { MathMeasureResponse };
