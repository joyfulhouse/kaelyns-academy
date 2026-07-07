import type { MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { MathMoneyPlayer } from "./Player";
import {
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type MathMoneyResponse,
} from "./logic";

/** math-money activity-type plugin: identify coins / count coins to a total. */
export const mathMoney: ActivityType<MathMoneyConfig, MathMoneyResponse> = {
  kind: "math-money",
  label: "Money",
  schema,
  Player: MathMoneyPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { MathMoneyResponse };
