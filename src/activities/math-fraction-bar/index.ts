import type { MathFractionBarConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathFractionBarPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type MathFractionBarResponse,
} from "./logic";

/** A focused equal-parts bar for partitioning and identifying fractions. */
export const mathFractionBar: ActivityType<
  MathFractionBarConfig,
  MathFractionBarResponse
> = {
  kind: "math-fraction-bar",
  label: "Fraction bar",
  schema,
  responseSchema,
  Player: MathFractionBarPlayer,
  score,
  skillsAffected,
  validateGenerated,
};

export type { MathFractionBarResponse };
