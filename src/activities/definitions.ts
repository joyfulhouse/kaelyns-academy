import type { ZodType } from "zod";
import type { ActivityKind } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import * as phonicsWordbuild from "./phonics-wordbuild/logic";
import * as sightwordGame from "./sightword-game/logic";
import * as mathTenframe from "./math-tenframe/logic";
import * as journalPrompt from "./journal-prompt/logic";
import * as readingComprehension from "./reading-comprehension/logic";
import * as mathArray from "./math-array/logic";
import * as mathFractionBar from "./math-fraction-bar/logic";
import * as langSymbolIntro from "./lang-symbol-intro/logic";
import * as langListenMatch from "./lang-listen-match/logic";
import * as mathClock from "./math-clock/logic";
import * as mathMoney from "./math-money/logic";
import * as mathMeasure from "./math-measure/logic";
import * as sortCategories from "./sort-categories/logic";
import * as seqOrder from "./seq-order/logic";
import * as oralReading from "./oral-reading/logic";

export interface ServerActivityDefinition<Config = unknown, Response = unknown> {
  kind: ActivityKind;
  /** How a browser completion proves final semantic success. Direct-answer
   * activities use the canonical score; richer response contracts validate
   * their final facts while scoring independence; oral reading is witnessed. */
  completionPolicy: "full-score" | "response-validated" | "server-witness";
  schema: ZodType<Config>;
  responseSchema: ZodType<Response>;
  score: (config: Config, response: Response) => ActivityScore;
  skillsAffected: (config: Config) => SkillTag[];
  validateGenerated?: (config: Config) => string | null;
}

type ServerActivityLogic<Config, Response> = Omit<
  ServerActivityDefinition<Config, Response>,
  "kind" | "completionPolicy"
>;

function defineServerActivity<Config, Response>(
  kind: ActivityKind,
  logic: ServerActivityLogic<Config, Response>,
  completionPolicy: ServerActivityDefinition["completionPolicy"],
): ServerActivityDefinition {
  const definition: ServerActivityDefinition<Config, Response> = {
    kind,
    completionPolicy,
    schema: logic.schema,
    responseSchema: logic.responseSchema,
    score: logic.score,
    skillsAffected: logic.skillsAffected,
    ...(logic.validateGenerated ? { validateGenerated: logic.validateGenerated } : {}),
  };
  return definition as unknown as ServerActivityDefinition;
}

const SERVER_ACTIVITY_TYPES = {
  "phonics-wordbuild": defineServerActivity(
    "phonics-wordbuild",
    phonicsWordbuild,
    "response-validated",
  ),
  "sightword-game": defineServerActivity(
    "sightword-game",
    sightwordGame,
    "response-validated",
  ),
  "math-tenframe": defineServerActivity("math-tenframe", mathTenframe, "full-score"),
  "journal-prompt": defineServerActivity(
    "journal-prompt",
    journalPrompt,
    "response-validated",
  ),
  "reading-comprehension": defineServerActivity(
    "reading-comprehension",
    readingComprehension,
    "response-validated",
  ),
  "math-array": defineServerActivity("math-array", mathArray, "full-score"),
  "math-fraction-bar": defineServerActivity("math-fraction-bar", mathFractionBar, "full-score"),
  "lang-symbol-intro": defineServerActivity("lang-symbol-intro", langSymbolIntro, "full-score"),
  "lang-listen-match": defineServerActivity("lang-listen-match", langListenMatch, "full-score"),
  "math-clock": defineServerActivity("math-clock", mathClock, "full-score"),
  "math-money": defineServerActivity("math-money", mathMoney, "full-score"),
  "math-measure": defineServerActivity("math-measure", mathMeasure, "full-score"),
  "sort-categories": defineServerActivity("sort-categories", sortCategories, "full-score"),
  "seq-order": defineServerActivity("seq-order", seqOrder, "full-score"),
  "oral-reading": defineServerActivity("oral-reading", oralReading, "server-witness"),
} satisfies Record<ActivityKind, ServerActivityDefinition>;

export function getServerActivityType(kind: ActivityKind): ServerActivityDefinition {
  return SERVER_ACTIVITY_TYPES[kind];
}

export function allServerActivityTypes(): ServerActivityDefinition[] {
  return Object.values(SERVER_ACTIVITY_TYPES);
}
