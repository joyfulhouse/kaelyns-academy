/**
 * Pure mappers between the `EditableVersion` DB shape (what the store/actions
 * return) and the flat `EditorFormValues` shape that react-hook-form holds.
 * No I/O, no side effects. Unit-tested in editor-model.test.ts.
 */
import type { ActivityKind } from "@/content/activity-configs";
import { ACTIVITY_CONFIG_SCHEMAS } from "@/content/activity-configs";
import type { EditableActivity, EditableLesson, EditableUnit, EditableVersion, VersionMetadata } from "@/lib/content/store";

// ── Form value types ──────────────────────────────────────────────────────────

export interface ActivityFormValues {
  activityKey: string;
  kind: string;
  title: string;
  blurb: string;
  estMinutes: string; // kept as string for the number input; converted on save
  band: string;
  skillTags: string[];
  standardTags: string[];
  /** Raw JSON string; validated per-kind before save. */
  configJson: string;
}

export interface LessonFormValues {
  lessonKey: string;
  title: string;
  activities: ActivityFormValues[];
}

export interface UnitFormValues {
  unitKey: string;
  title: string;
  emoji: string;
  world: string;
  bigIdea: string;
  phonicsFocus: string;
  mathFocus: string;
  project: string;
  checkpoint: string; // "" | "baseline" | "mid" | "final"
  lessons: LessonFormValues[];
}

export interface MetadataFormValues {
  title: string;
  subtitle: string;
  ageBand: string;
  summary: string;
  world: string;
  locale: string;
  languages: string; // comma-separated; converted to array on save
}

export interface EditorFormValues {
  metadata: MetadataFormValues;
  units: UnitFormValues[];
}

// ── Minimal valid config skeletons ────────────────────────────────────────────

/**
 * Return a minimal valid config object for the given activity kind.
 * Each skeleton passes `ACTIVITY_CONFIG_SCHEMAS[kind].safeParse`.
 */
export function defaultConfigFor(kind: ActivityKind): unknown {
  switch (kind) {
    case "phonics-wordbuild":
      return { focus: "", instruction: "", tiles: ["a", "b"], words: [{ word: "ab" }] };
    case "sightword-game":
      return { instruction: "", words: ["the", "and"] };
    case "math-tenframe":
      return { instruction: "", mode: "represent", target: 5 };
    case "journal-prompt":
      return { prompt: "" };
    case "reading-comprehension":
      return {
        instruction: "",
        passage: "",
        questions: [
          { prompt: "Question?", choices: ["A", "B"], answerIndex: 0 },
        ],
      };
    case "math-array":
      return { instruction: "", mode: "build", rows: 2, cols: 3 };
    case "lang-symbol-intro":
      return {
        locale: "zh-TW",
        instruction: "",
        skillTags: ["zhuyin.symbols.initials"],
        symbols: [{ id: "b", symbol: "ㄅ", romanization: "b", spoken: "ㄅ" }],
        verify: [{ prompt: "What is ㄅ?", choices: ["b", "p"], answerIndex: 0 }],
      };
    case "lang-listen-match":
      return {
        locale: "zh-TW",
        instruction: "",
        skillTags: ["zhuyin.symbols.initials"],
        items: [
          { spoken: "ㄅ", choices: ["ㄅ", "ㄆ"], answerIndex: 0 },
        ],
      };
  }
}

// ── Factory functions for new empty nodes ─────────────────────────────────────

export function newActivity(): ActivityFormValues {
  const kind: ActivityKind = "phonics-wordbuild";
  return {
    activityKey: `activity-${Date.now()}`,
    kind,
    title: "",
    blurb: "",
    estMinutes: "",
    band: "ready",
    skillTags: [],
    standardTags: [],
    configJson: JSON.stringify(defaultConfigFor(kind), null, 2),
  };
}

export function newLesson(): LessonFormValues {
  return {
    lessonKey: `lesson-${Date.now()}`,
    title: "",
    activities: [],
  };
}

export function newUnit(): UnitFormValues {
  return {
    unitKey: `unit-${Date.now()}`,
    title: "",
    emoji: "",
    world: "sunshine",
    bigIdea: "",
    phonicsFocus: "",
    mathFocus: "",
    project: "",
    checkpoint: "",
    lessons: [],
  };
}

// ── editableToForm ────────────────────────────────────────────────────────────

/** Map an `EditableVersion` (DB shape) → `EditorFormValues` (RHF shape). */
export function editableToForm(ev: EditableVersion): EditorFormValues {
  return {
    metadata: metadataToForm(ev.metadata),
    units: ev.units.map(unitToForm),
  };
}

function metadataToForm(m: VersionMetadata): MetadataFormValues {
  return {
    title: m.title,
    subtitle: m.subtitle ?? "",
    ageBand: m.ageBand ?? "",
    summary: m.summary ?? "",
    world: m.world ?? "",
    locale: m.locale ?? "",
    languages: m.languages.join(", "),
  };
}

function unitToForm(u: EditableUnit): UnitFormValues {
  return {
    unitKey: u.unitKey,
    title: u.title,
    emoji: u.emoji ?? "",
    world: u.world,
    bigIdea: u.bigIdea ?? "",
    phonicsFocus: u.phonicsFocus ?? "",
    mathFocus: u.mathFocus ?? "",
    project: u.project ?? "",
    checkpoint: u.checkpoint ?? "",
    lessons: u.lessons.map(lessonToForm),
  };
}

function lessonToForm(l: EditableLesson): LessonFormValues {
  return {
    lessonKey: l.lessonKey,
    title: l.title,
    activities: l.activities.map(activityToForm),
  };
}

function activityToForm(a: EditableActivity): ActivityFormValues {
  return {
    activityKey: a.activityKey,
    kind: a.kind,
    title: a.title,
    blurb: a.blurb ?? "",
    estMinutes: a.estMinutes != null ? String(a.estMinutes) : "",
    band: a.band,
    skillTags: [...a.skillTags],
    standardTags: [...a.standardTags],
    configJson: JSON.stringify(a.config, null, 2),
  };
}

// ── formToEditable ────────────────────────────────────────────────────────────

/**
 * Map `EditorFormValues` (RHF shape) → the `{ metadata, units }` shape that
 * `saveVersionTreeAction` accepts. Callers must ensure `configJson` is valid
 * JSON before calling this (ConfigEditor enforces that).
 */
export function formToEditable(fv: EditorFormValues): {
  metadata: VersionMetadata;
  units: EditableUnit[];
} {
  return {
    metadata: formToMetadata(fv.metadata),
    units: fv.units.map(formToUnit),
  };
}

function formToMetadata(m: MetadataFormValues): VersionMetadata {
  return {
    title: m.title,
    subtitle: m.subtitle || undefined,
    ageBand: m.ageBand || undefined,
    summary: m.summary || undefined,
    world: m.world || undefined,
    locale: m.locale || undefined,
    languages: m.languages
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function formToUnit(u: UnitFormValues): EditableUnit {
  return {
    unitKey: u.unitKey,
    title: u.title,
    emoji: u.emoji || undefined,
    world: u.world,
    bigIdea: u.bigIdea || undefined,
    phonicsFocus: u.phonicsFocus || undefined,
    mathFocus: u.mathFocus || undefined,
    project: u.project || undefined,
    checkpoint: u.checkpoint || undefined,
    lessons: u.lessons.map(formToLesson),
  };
}

function formToLesson(l: LessonFormValues): EditableLesson {
  return {
    lessonKey: l.lessonKey,
    title: l.title,
    activities: l.activities.map(formToActivity),
  };
}

function formToActivity(a: ActivityFormValues): EditableActivity {
  let config: unknown = {};
  try {
    config = JSON.parse(a.configJson) as unknown;
  } catch {
    // Malformed JSON — pass raw; server will reject with 'invalid'
    config = a.configJson;
  }
  return {
    activityKey: a.activityKey,
    kind: a.kind,
    title: a.title,
    blurb: a.blurb || undefined,
    estMinutes: a.estMinutes ? Number(a.estMinutes) : undefined,
    band: a.band,
    skillTags: [...a.skillTags],
    standardTags: [...a.standardTags],
    config,
  };
}

// ── Config validation helper ──────────────────────────────────────────────────

/**
 * Validate a raw JSON string against the schema for `kind`.
 * Returns `{ ok: true }` or `{ ok: false; message: string }`.
 */
export function validateConfigJson(
  kind: string,
  json: string,
): { ok: true } | { ok: false; message: string } {
  const schema = ACTIVITY_CONFIG_SCHEMAS[kind as ActivityKind];
  if (!schema) return { ok: false, message: `Unknown activity kind: "${kind}"` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, message: "Invalid JSON" };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".") ?? "";
    const msg = first?.message ?? "Invalid config";
    return { ok: false, message: path ? `${path}: ${msg}` : msg };
  }
  return { ok: true };
}
