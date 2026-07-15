import type { MathTenframeConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathTenframePlayer } from "./Player";
import {
  goalFor,
  responseSchema,
  schema,
  score,
  skillsAffected,
  type MathTenframeResponse,
} from "./logic";

/** math-tenframe activity-type plugin: represent a number or make-ten / count-on. */
export const mathTenframe: ActivityType<MathTenframeConfig, MathTenframeResponse> = {
  kind: "math-tenframe",
  label: "Ten-frame",
  schema,
  responseSchema,
  Player: MathTenframePlayer,
  score,
  skillsAffected,
};
export type { MathTenframeResponse };
