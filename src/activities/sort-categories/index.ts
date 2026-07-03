import type { SortCategoriesConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { SortCategoriesPlayer } from "./Player";
import { schema, score, skillsAffected, type SortCategoriesResponse } from "./logic";

/** sort-categories activity-type plugin: tap items into labeled bins. */
export const sortCategories: ActivityType<SortCategoriesConfig, SortCategoriesResponse> = {
  kind: "sort-categories",
  label: "Sort",
  schema,
  Player: SortCategoriesPlayer,
  score,
  skillsAffected,
};
export type { SortCategoriesResponse };
