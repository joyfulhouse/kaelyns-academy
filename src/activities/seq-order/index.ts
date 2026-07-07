import type { SeqOrderConfig } from "@/content/activity-configs";
import type { ActivityType } from "@/content/types";
import { SeqOrderPlayer } from "./Player";
import {
  schema,
  score,
  skillsAffected,
  validateGenerated,
  type SeqOrderResponse,
} from "./logic";

/** seq-order activity-type plugin: tap cards into their correct sequence. */
export const seqOrder: ActivityType<SeqOrderConfig, SeqOrderResponse> = {
  kind: "seq-order",
  label: "Order",
  schema,
  Player: SeqOrderPlayer,
  score,
  skillsAffected,
  validateGenerated,
};
export type { SeqOrderResponse };
