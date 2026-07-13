import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type {
  ActivityKind,
  JournalPromptConfig,
  LangListenMatchConfig,
  LangSymbolIntroConfig,
  MathArrayConfig,
  MathClockConfig,
  MathMeasureConfig,
  MathMoneyConfig,
  MathTenframeConfig,
  OralReadingConfig,
  PhonicsWordbuildConfig,
  ReadingComprehensionConfig,
  SeqOrderConfig,
  SightwordGameConfig,
  SortCategoriesConfig,
} from "./activity-configs";

export type { ActivityKind };

export type Band = "ready" | "stretch";
export type SkillDomain =
  | "phonics" // Program 01 (archived)
  | "reading"
  | "word" // word study: multisyllable decoding + morphology
  | "vocab" // vocabulary depth
  | "writing"
  | "math"
  | "habits"
  | "lifeskills" // Life Skills Math (B1): time · money · measurement
  | "science" // Science & Nature (B2): classify · sequence
  // World Languages — one domain per language (one parent-report row each).
  | "zhuyin"
  | "spanish"
  | "japanese"
  | "korean";
export type SkillTag = string; // "phonics.digraphs"
type StandardTag = string; // "CCSS.RF.1.3"

/** Per-program visual world (sets --accent over the stable shell). */
export type World = "sunshine" | "ocean" | "space" | "garden" | "bigtop";

export interface Skill {
  slug: SkillTag;
  domain: SkillDomain;
  label: string;
  readyIndicator: string;
  stretchIndicator?: string;
}

interface ActivityBase {
  id: string;
  title: string;
  blurb?: string;
  estMinutes?: number;
  skillTags: SkillTag[];
  standardTags?: StandardTag[];
  band: Band;
}

/** Discriminated by kind so `config` is type-checked at authoring time. */
type ActivityOf<K extends ActivityKind, C> = ActivityBase & { kind: K; config: C };

export type Activity =
  | ActivityOf<"phonics-wordbuild", PhonicsWordbuildConfig>
  | ActivityOf<"sightword-game", SightwordGameConfig>
  | ActivityOf<"math-tenframe", MathTenframeConfig>
  | ActivityOf<"journal-prompt", JournalPromptConfig>
  | ActivityOf<"reading-comprehension", ReadingComprehensionConfig>
  | ActivityOf<"math-array", MathArrayConfig>
  | ActivityOf<"lang-symbol-intro", LangSymbolIntroConfig>
  | ActivityOf<"lang-listen-match", LangListenMatchConfig>
  | ActivityOf<"math-clock", MathClockConfig>
  | ActivityOf<"math-money", MathMoneyConfig>
  | ActivityOf<"math-measure", MathMeasureConfig>
  | ActivityOf<"sort-categories", SortCategoriesConfig>
  | ActivityOf<"seq-order", SeqOrderConfig>
  | ActivityOf<"oral-reading", OralReadingConfig>;

type CheckpointKind = "baseline" | "mid" | "final";

export interface Lesson {
  id: string;
  order: number;
  title: string; // "Monday"
  activities: Activity[];
}

export interface Unit {
  id: string;
  order: number;
  title: string; // "Under the Sea"
  emoji: string;
  world: World;
  bigIdea: string;
  phonicsFocus: string;
  mathFocus: string;
  project: string;
  checkpoint?: CheckpointKind;
  /** Adventure 2.0 branching: consecutive units sharing a non-null branchKey
   *  render as parallel map paths (spec §4.4). Undefined = the single main path. */
  branchKey?: string;
  lessons: Lesson[];
}

export interface Program {
  slug: string;
  title: string;
  subtitle: string;
  ageBand: string;
  summary: string;
  units: Unit[];
}

/* ── Activity-type plugin contract ──────────────────────────────────────────
   Each interactive activity kind is a self-contained module: a schema that
   validates content/AI-generated config, a Player UI, and scoring that emits
   skill evidence. A registry maps kind → ActivityType (see registry.ts). */

export type SkillOutcome = "not_yet" | "emerging" | "solid";

export interface ActivityScore {
  correct: number;
  total: number;
  stars: 0 | 1 | 2 | 3;
  skillEvidence: { skill: SkillTag; outcome: SkillOutcome }[];
}

export interface ActivityPlayerProps<Config, Response> {
  config: Config;
  onComplete: (response: Response, score: ActivityScore) => void;
  onExit?: () => void;
  /** Account-only learner context. Guests receive no context and Players must
   * degrade without calling gated learner APIs. */
  learnerContext?: {
    learnerId: string;
    oralReading: boolean;
  };
}

export interface ActivityType<Config = unknown, Response = unknown> {
  kind: ActivityKind;
  label: string;
  schema: ZodType<Config>;
  Player: ComponentType<ActivityPlayerProps<Config, Response>>;
  score: (config: Config, response: Response) => ActivityScore;
  skillsAffected: (config: Config) => SkillTag[];
  /**
   * Optional deterministic answer-key check for AI-GENERATED configs (B3 §6):
   * returns null when internally consistent, else a short reason. Run
   * server-side after zod parse, before an item is persisted or returned.
   * Authored content is validated by review + content tests, not this.
   */
  validateGenerated?: (config: Config) => string | null;
}
