import type { ZodType } from "zod";
import type { Activity, ActivityKind, Program, Unit } from "@/content";
import type { LearnerMode } from "./learnerAccess";

export interface PlayableActivityInput {
  mode: LearnerMode;
  ready: boolean;
  available: boolean;
  program: Program | null;
  activeUnitKeys: string[] | undefined;
  unitKey: string;
  activityKey: string;
  ssrUnit: Unit | null;
  ssrActivity: Activity | null;
}

export type PlayableActivityResolution =
  | { status: "loading" }
  | { status: "blocked" }
  | { status: "moved" }
  | { status: "ready"; unit: Unit; activity: Activity };

export function resolvePlayableActivity(
  input: PlayableActivityInput,
): PlayableActivityResolution {
  if (input.mode === "loading" || input.mode === "error") {
    return { status: "loading" };
  }

  if (input.mode === "account") {
    if (!input.ready) return { status: "loading" };

    const curatedOut =
      input.activeUnitKeys !== undefined &&
      input.activeUnitKeys.length > 0 &&
      !input.activeUnitKeys.includes(input.unitKey);
    if (!input.available || curatedOut) return { status: "blocked" };

    const unit = input.program?.units.find((candidate) => candidate.id === input.unitKey);
    const activity = unit ? activityInUnit(unit, input.activityKey) : undefined;
    return unit && activity ? { status: "ready", unit, activity } : { status: "moved" };
  }

  const unit = input.ssrUnit?.id === input.unitKey ? input.ssrUnit : null;
  const activity = unit ? activityInUnit(unit, input.activityKey) : undefined;
  const matchesServerActivity =
    activity !== undefined &&
    input.ssrActivity?.id === activity.id &&
    input.ssrActivity.kind === activity.kind;
  return unit && activity && matchesServerActivity
    ? { status: "ready", unit, activity }
    : { status: "moved" };
}

function activityInUnit(unit: Unit, activityKey: string): Activity | undefined {
  for (const lesson of unit.lessons) {
    const activity = lesson.activities.find((candidate) => candidate.id === activityKey);
    if (activity) return activity;
  }
  return undefined;
}

export type PlayerConfigResolution<T> =
  | { status: "malformed" }
  | { status: "ready"; config: T };

export function safeParsePlayerConfig<T>(
  schema: ZodType<T>,
  config: unknown,
): PlayerConfigResolution<T> {
  const parsed = schema.safeParse(config);
  return parsed.success
    ? { status: "ready", config: parsed.data }
    : { status: "malformed" };
}

export interface PlayerIdentityInput {
  learnerId: string;
  programSlug: string;
  unitKey: string;
  activityKey: string;
  kind: ActivityKind;
  variant: string;
  sequence: number;
  content: unknown;
  config: unknown;
}

export function playerIdentityKey(input: PlayerIdentityInput): string {
  const prefix = [
    input.learnerId,
    input.programSlug,
    input.unitKey,
    input.activityKey,
    input.kind,
    input.variant,
    String(input.sequence),
  ]
    .map(encodeURIComponent)
    .join(":");
  return `${prefix}:${fingerprint({ content: input.content, config: input.config })}`;
}

export interface GeneratedPracticeRowIdentity {
  id: string;
  learnerId: string;
  programSlug: string;
  unitKey: string;
}

export interface LoadedGeneratedPractice<Row extends GeneratedPracticeRowIdentity> {
  requestKey: string;
  row: Row | null;
}

export interface GeneratedPracticeResolutionInput<Row extends GeneratedPracticeRowIdentity> {
  mode: LearnerMode;
  ready: boolean;
  available: boolean;
  selectedLearnerId: string | null;
  programSlug: string;
  generatedId: string;
  activeUnitKeys: string[] | undefined;
  loaded: LoadedGeneratedPractice<Row> | null;
}

export type GeneratedPracticeResolution<Row extends GeneratedPracticeRowIdentity> =
  | { status: "loading" }
  | { status: "blocked" }
  | { status: "moved" }
  | { status: "ready"; row: Row };

export function generatedPracticeRequestKey(
  learnerId: string,
  programSlug: string,
  generatedId: string,
): string {
  return [learnerId, programSlug, generatedId].map(encodeURIComponent).join(":");
}

export function resolveGeneratedPractice<Row extends GeneratedPracticeRowIdentity>(
  input: GeneratedPracticeResolutionInput<Row>,
): GeneratedPracticeResolution<Row> {
  if (input.mode === "loading" || input.mode === "error") return { status: "loading" };
  if (input.mode === "guest") return { status: "moved" };
  if (!input.ready || !input.selectedLearnerId) return { status: "loading" };
  if (!input.available) return { status: "blocked" };

  const requestKey = generatedPracticeRequestKey(
    input.selectedLearnerId,
    input.programSlug,
    input.generatedId,
  );
  if (input.loaded?.requestKey !== requestKey) return { status: "loading" };

  const row = input.loaded.row;
  if (
    !row ||
    row.id !== input.generatedId ||
    row.learnerId !== input.selectedLearnerId ||
    row.programSlug !== input.programSlug
  ) {
    return { status: "moved" };
  }

  const curatedOut =
    input.activeUnitKeys !== undefined &&
    input.activeUnitKeys.length > 0 &&
    !input.activeUnitKeys.includes(row.unitKey);
  return curatedOut ? { status: "blocked" } : { status: "ready", row };
}

function fingerprint(value: unknown): string {
  const canonical = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${canonical.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
    case "undefined":
      return "undefined";
    case "bigint":
      return `${value.toString()}n`;
    case "object": {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
      return `{${entries.join(",")}}`;
    }
    case "function":
    case "symbol":
      return JSON.stringify(String(value));
  }
  return JSON.stringify(String(value));
}
