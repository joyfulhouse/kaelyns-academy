import type { SightwordGameConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { SightwordGamePlayer } from "./Player";
import { schema, score, skillsAffected, type SightwordGameResponse } from "./logic";

/** sightword-game activity-type plugin: find the real sight words among decoys. */
export const sightwordGame: ActivityType<SightwordGameConfig, SightwordGameResponse> = {
  kind: "sightword-game",
  label: "Word hunt",
  schema,
  Player: SightwordGamePlayer,
  score,
  skillsAffected,
};

export { schema, score, skillsAffected };
export type { SightwordGameResponse };
