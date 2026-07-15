import type { MathArrayConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathArrayPlayer } from "./Player";
import {
  expectedFor,
  responseSchema,
  schema,
  score,
  skillsAffected,
  totalFor,
  type MathArrayResponse,
} from "./logic";

/** math-array activity-type plugin: a rows x cols manipulative for building
 *  arrays, multiplication, area, and sharing (division). Visual-first. */
export const mathArray: ActivityType<MathArrayConfig, MathArrayResponse> = {
  kind: "math-array",
  label: "Array builder",
  schema,
  responseSchema,
  Player: MathArrayPlayer,
  score,
  skillsAffected,
};
export type { MathArrayResponse };
