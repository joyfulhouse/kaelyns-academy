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

/** Free-placement classification with an explicit completed-board check. */
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
