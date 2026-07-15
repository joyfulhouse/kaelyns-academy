import type { SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { SortCategoriesPlayer } from "./Player";
import {
  responseSchema,
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type SortCategoriesResponse,
} from "./logic";

/** sort-categories activity-type plugin: tap items into labeled bins. */
export const sortCategories: ActivityType<SortCategoriesConfig, SortCategoriesResponse> = {
  kind: "sort-categories",
  label: "Sort",
  schema,
  responseSchema,
  Player: SortCategoriesPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { SortCategoriesResponse };
