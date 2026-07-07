# Adventure 2.0 B3 — Adaptive Generation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finishing a lesson generates fresh, durable, playable exercise variations (DeepSeek V4 via LiteLLM), surfaced as a "Fresh practice, made for you" shelf that feeds the recommender — plus all 11 program kinds become generable (with deterministic answer-key validators) and the Word Study skill-slug mismatch is fixed.

**Architecture:** A new learner-scoped `generated_activity` table holds validated generated configs. An idempotent server action `ensureLessonPractice` (tenancy + aiPractice gates + lesson-completion witness + 4/batch + 8/lesson cap) generates via the existing `generatePracticeItems`, now backed by `ds4`/`ds4-fast` routes and a per-kind deterministic `validateGenerated` layer. Shelf items render in UnitView, feed the next-thing card, play through a new generated-activity route, and earn stars once via a second server-verified membership witness.

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript strict, Drizzle ORM (Postgres/CNPG), zod, Vitest, Playwright, bun, LiteLLM gateway.

## Global Constraints

- **bun only.** `bun run lint && bun run typecheck && bun run test && bun run build` + `bun run audit:dead-code` clean before merge.
- **Build-safety:** never `getDb()`/`getAuth()` at module top level — lazy per-request only. `src/lib/ai/models.ts` reads env only inside functions.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`) — fix root cause.
- **§8 child-data posture:** ALL generation server-side, schema-validated + kind-validated, bounded (**4 per batch, 8 per lesson**, existing `MAX_ITEMS` guard), no open-ended chat, parent `aiPractice` gates enforced server-side, full gen provenance, no child PII in prompts.
- **Model routes (spec §3):** `TUTOR_RICH = "ds4"`, `TUTOR_FAST = "ds4-fast"` (verified live on the gateway). Never a provider SDK.
- **Generated stars:** a shelf item earns stars **once**, via a server-verified `generated_activity` ownership witness — never client-trusted.
- **Answer-key safety (spec §6):** every generated item passes its kind's deterministic `validateGenerated` before persist/return; invalid items are dropped (short batch acceptable); `seq-order` briefs restricted to common-knowledge sequences.
- **Route handlers must not import client components:** validators live in server-safe `logic.ts` files; the validator map imports only `logic.ts`, never `index.ts`/`Player.tsx`.
- **e2e is LLM-free** (the CI gate env has no LiteLLM): assert affordances/gating only, never live generation.
- **DB-preferred curriculum:** Task 7 edits `kaelyn-adaptive.ts` → **REQUIRED prod `seed-content.ts` re-run** at ship (Task 8).
- Each task adds code AND wiring in ONE commit, ending full-suite green. Reuse existing helpers (`withAccount`, `withOwnedLearner`, `getCompletedActivityIds`, `resolveLearnerProgram`, `findUnitIdOfActivity`, `generatePracticeItems`); never duplicate a logic block.
- Static Tailwind class maps only; Phosphor icons only; forgiving copy (no error language on the kid surface).

---

## File Structure

- `src/lib/ai/models.ts` — route constants → ds4 (Task 3).
- `src/lib/db/schema.ts` + `drizzle/` + `src/lib/db/health.ts` — `generatedActivity` table (Task 1).
- `src/activities/<kind>/logic.ts` — `validateGenerated` exports for the 5 risky kinds (Task 2); Word Study `skillsAffected` fixes (Task 7).
- `src/lib/ai/generated-validators.ts` — server-safe validator map (Task 2).
- `src/content/types.ts` — optional `validateGenerated` on `ActivityType` (Task 2).
- `src/lib/ai/practice.ts` — 5 new `KIND_BRIEF` entries + central validator filter in `generatePracticeItems` (Task 2).
- `src/lib/tutor/shelf.ts` (new) — `generateLessonBatch`, shelf reads, caps (Task 3).
- `src/app/(learner)/actions.ts` — `ensureLessonPractice` action + shelf in `getLearnerStateAction` + `shelfEligible` witness (Tasks 3, 4).
- `src/lib/tutor/store.ts` — shelf persist/read + star-witness extension + COPPA (Tasks 3, 4, 6).
- `src/app/(learner)/learn/[programSlug]/generated/[generatedId]/page.tsx` (new) — play route (Task 4).
- `src/components/learner/GeneratedPracticeHost.tsx` (new) — client host for shelf items (Task 4).
- `src/components/learner/useLearnerState.ts` — `record()` shelf handling + `generatedShelf` state (Tasks 4, 5).
- `src/components/learner/UnitView.tsx`, `StudioHome.tsx`, `ActivityHost.tsx` — shelf UI, next-thing fallback, `isGenerableKind` gate (Task 5).
- `src/lib/tutor/export.ts` — `generatedActivities` in the export (Task 6).
- `src/content/programs/kaelyn-adaptive.ts` — sightword `skillTag` fields (Task 7).
- `e2e/specs/adaptive-generation.spec.ts` (Task 8).

---

### Task 1: `generated_activity` table + migration + health canary

**Files:**
- Modify: `src/lib/db/schema.ts` (add table after `checkpointResult`), `src/lib/db/health.ts` (REQUIRED_COLUMNS), `src/lib/tutor/account-export.ts` (+ its test's disposition map — the fails-closed export-inventory guard trips on any new learner-FK table; declare the category now, wire the real export in Task 6, exactly the C1 Task-1 precedent)
- Create: `drizzle/<generated>.sql` via `bun run db:generate`
- Test: extend `src/lib/db/schema.test.ts`

**Interfaces:**
- Produces: `generatedActivity` pgTable; row shape `{ id, learnerId, programSlug, unitKey, lessonId, kind, title, config (jsonb unknown), skillTags (jsonb string[]), genModel, genRoute, genAt, createdAt }`; export-inventory category string `"generatedActivities"`.

- [ ] **Step 1: Add the table to `schema.ts`** (mirror `checkpointResult`'s idioms exactly — text pk `$defaultFn(uuid)`, cascade FK, timestamptz):

```ts
/**
 * Adaptive generation (Adventure 2.0 B3, spec §4): durable, learner-private
 * AI-generated practice. One row per generated item, persisted only after
 * schema + kind validation. Never part of the shared authored curriculum.
 */
export const generatedActivity = pgTable(
  "generated_activity",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    programSlug: text("program_slug").notNull(),
    /** Stable authored unit key (locates the shelf on the map). */
    unitKey: text("unit_key").notNull(),
    /** Stable authored lesson id the batch was generated for. */
    lessonId: text("lesson_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** Kind config — zod-parsed AND kind-validated before insert. */
    config: jsonb("config").$type<unknown>().notNull(),
    skillTags: jsonb("skill_tags").$type<string[]>().notNull().default([]),
    /** Gen provenance (same trio as attempt.gen_*). */
    genModel: text("gen_model").notNull(),
    genRoute: text("gen_route").notNull(),
    genAt: timestamp("gen_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The shelf read + the per-lesson cap count.
    index("generated_activity_learner_lesson_idx").on(t.learnerId, t.lessonId),
    // COPPA whole-learner reads (export/delete verification).
    index("generated_activity_learner_idx").on(t.learnerId),
  ],
);
```

- [ ] **Step 2: Health canary.** Add to `REQUIRED_COLUMNS` in `src/lib/db/health.ts` (snake_case, matching siblings):

```ts
  generated_activity: ["id", "learner_id", "program_slug", "unit_key", "lesson_id", "kind", "title", "config", "skill_tags", "gen_model", "gen_route", "gen_at", "created_at"],
```

- [ ] **Step 3: Export-inventory declaration.** In `src/lib/tutor/account-export.ts`, add `generated_activity: "generatedActivities"` to the table-disposition map and `"generatedActivities"` to `EXPORT_CONTENTS`, mirroring how `checkpoint_result: "checkpointResults"` was declared in C1 Task 1 (comment it `// (Task 6)`); update `account-export.test.ts`'s disposition map the same way. Declares intent only — do NOT write export read logic here.

- [ ] **Step 4: Generate migration.** Run: `bun run db:generate`. Verify the new `drizzle/NNNN_*.sql` creates ONLY `generated_activity` + its 2 indexes; journal advances by one.

- [ ] **Step 5: Schema-presence test** (extend `src/lib/db/schema.test.ts`, mirror the checkpoint_result test):

```ts
describe("generated_activity schema", () => {
  it("exposes the B3 shelf columns", () => {
    const cols = Object.keys(generatedActivity);
    for (const c of ["id", "learnerId", "programSlug", "unitKey", "lessonId", "kind", "title", "config", "skillTags", "genModel", "genRoute", "genAt", "createdAt"]) {
      expect(cols).toContain(c);
    }
  });
});
```

- [ ] **Step 6: Full gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build` → PASS (the export-inventory guard must pass with the declaration).

- [ ] **Step 7: Commit.**
```bash
git add src/lib/db/ src/lib/tutor/account-export.ts src/lib/tutor/account-export.test.ts drizzle/
git commit -m "feat(db): generated_activity table for the adaptive-generation shelf (B3)"
```

---

### Task 2: Validators + briefs — all 5 authored-only kinds become generable, safely

**Files:**
- Modify: `src/content/types.ts` (optional `validateGenerated` on `ActivityType`); `src/activities/{math-clock,math-money,math-measure,sort-categories,seq-order}/logic.ts` (+ each kind's `index.ts` wires it); `src/lib/ai/practice.ts` (5 `KIND_BRIEF` entries + central filter in `generatePracticeItems`)
- Create: `src/lib/ai/generated-validators.ts`
- Test: `src/lib/ai/generated-validators.test.ts` + extend each kind's `logic.test.ts`

**Interfaces:**
- Produces: `validateGenerated(config): string | null` exported from each risky kind's `logic.ts` (null = valid); `VALIDATE_GENERATED: Partial<Record<ActivityKind, (config: unknown) => string | null>>` from `src/lib/ai/generated-validators.ts`; `generatePracticeItems` now drops invalid items (throws only if ALL items invalid).
- Consumes: config types from `@/content/activity-configs` (shapes verified against source — see each validator).

- [ ] **Step 1: Contract field.** In `src/content/types.ts`, add to `ActivityType`:

```ts
  /**
   * Optional deterministic answer-key check for AI-GENERATED configs (B3 §6):
   * returns null when internally consistent, else a short reason. Run
   * server-side after zod parse, before an item is persisted or returned.
   * Authored content is validated by review + content tests, not this.
   */
  validateGenerated?: (config: Config) => string | null;
```

- [ ] **Step 2: The five validators** (each in that kind's `logic.ts`, server-safe, no React; wire `validateGenerated` into the kind's `index.ts` `ActivityType` object). Exact code:

`src/activities/math-money/logic.ts`:
```ts
const COIN_CENTS = { penny: 1, nickel: 5, dime: 10, quarter: 25 } as const;

/** B3 §6: deterministic answer-key consistency for generated money items. */
export function validateGenerated(config: MathMoneyConfig): string | null {
  if (config.mode === "identify") {
    if (!config.coins.includes(config.targetCoin)) return "targetCoin not among coins";
    return null;
  }
  // count mode: targetCents must be reachable from the palette (bounded DP).
  const reachable = new Set<number>([0]);
  for (let c = 1; c <= config.targetCents; c++) {
    for (const coin of config.palette) {
      const v = COIN_CENTS[coin];
      if (c - v >= 0 && reachable.has(c - v)) { reachable.add(c); break; }
    }
  }
  return reachable.has(config.targetCents) ? null : "targetCents unreachable from palette";
}
```

`src/activities/math-clock/logic.ts`:
```ts
/** B3 §6: the marked choice must render the stated time; choices unique. */
export function validateGenerated(config: MathClockConfig): string | null {
  if (config.mode === "set") return null; // no answer key beyond the schema
  if (config.answerIndex >= config.choices.length) return "answerIndex out of range";
  if (new Set(config.choices).size !== config.choices.length) return "duplicate choices";
  const want = `${config.hour}:${config.minute === 0 ? "00" : "30"}`;
  return config.choices[config.answerIndex] === want
    ? null
    : `answer choice "${config.choices[config.answerIndex]}" is not ${want}`;
}
```

`src/activities/math-measure/logic.ts`:
```ts
/** B3 §6: the marked answer must be the true (unique) extreme / true length. */
export function validateGenerated(config: MathMeasureConfig): string | null {
  if (config.mode === "compare") {
    if (config.answerIndex >= config.items.length) return "answerIndex out of range";
    const sizes = config.items.map((i) => i.size);
    const extreme = config.question === "most" ? Math.max(...sizes) : Math.min(...sizes);
    if (sizes.filter((s) => s === extreme).length !== 1) return "extreme is not unique";
    return sizes[config.answerIndex] === extreme ? null : "answer is not the extreme";
  }
  if (config.answerIndex >= config.choices.length) return "answerIndex out of range";
  if (new Set(config.choices).size !== config.choices.length) return "duplicate choices";
  return config.choices[config.answerIndex] === config.length
    ? null
    : "answer choice does not equal the true length";
}
```

`src/activities/sort-categories/logic.ts`:
```ts
/** B3 §6: bins unique, every bin used (binId integrity is the schema refine). */
export function validateGenerated(config: SortCategoriesConfig): string | null {
  const ids = config.bins.map((b) => b.id);
  if (new Set(ids).size !== ids.length) return "duplicate bin ids";
  for (const bin of config.bins) {
    if (!config.items.some((it) => it.binId === bin.id)) return `bin "${bin.id}" has no items`;
  }
  return null;
}
```

`src/activities/seq-order/logic.ts`:
```ts
/** B3 §6: structural only — labels unique (factuality is constrained by the brief). */
export function validateGenerated(config: SeqOrderConfig): string | null {
  const labels = config.cards.map((c) => c.label.trim().toLowerCase());
  return new Set(labels).size === labels.length ? null : "duplicate card labels";
}
```

- [ ] **Step 3: Server-safe map.** Create `src/lib/ai/generated-validators.ts` (imports ONLY `logic.ts` files — never `index.ts`/Players, so route handlers stay client-free):

```ts
import type { ActivityKind } from "@/content/activity-configs";
import { validateGenerated as money } from "@/activities/math-money/logic";
import { validateGenerated as clock } from "@/activities/math-clock/logic";
import { validateGenerated as measure } from "@/activities/math-measure/logic";
import { validateGenerated as sort } from "@/activities/sort-categories/logic";
import { validateGenerated as seq } from "@/activities/seq-order/logic";

/** B3 §6: deterministic post-parse answer-key checks for generated items.
 *  Kinds absent here have no answer-key consistency to check beyond zod. */
export const VALIDATE_GENERATED: Partial<
  Record<ActivityKind, (config: never) => string | null>
> = {
  "math-money": money,
  "math-clock": clock,
  "math-measure": measure,
  "sort-categories": sort,
  "seq-order": seq,
};
```

(Adjust the `never`/generic typing to whatever compiles clean under strict mode without casts — e.g. type the map values as `(config: any) => string | null` is FORBIDDEN; use a generic accessor `validateGeneratedFor(kind, config)` that narrows via the schema output type if needed.)

- [ ] **Step 4: Central filter.** In `src/lib/ai/practice.ts` `generatePracticeItems`, after the envelope zod parse and before returning items, filter through the map (covers BOTH the button path and Task 3's batch path):

```ts
  const validator = VALIDATE_GENERATED[kind];
  const valid = validator
    ? parsedItems.filter((item) => validator(item as never) === null)
    : parsedItems;
  if (valid.length === 0) {
    throw new Error(`generatePracticeItems: all ${kind} items failed answer-key validation`);
  }
  return valid;
```

(Adapt names to the function's real locals; keep the existing return type.)

- [ ] **Step 5: Five `KIND_BRIEF` entries** in `src/lib/ai/practice.ts` (match the existing prose-brief format — each states the exact config shape + hard rules; the model output is zod-parsed against the real schema regardless):

```ts
  "sort-categories":
    'Sort-into-bins items. Each: {instruction, bins:[{id,label,emoji?}] (2-4), items:[{label,emoji?,binId}] (3-8)}. ' +
    "Every item.binId MUST equal one bins[].id; every bin gets at least one item; bin ids are short lowercase slugs. " +
    "Categories must be observably, factually correct for a 6-year-old (living/nonliving, animal groups, materials, land/water).",
  "seq-order":
    'Put-in-order items. Each: {instruction, cards:[{label,emoji?}] (3-6)}. ARRAY ORDER IS THE ANSWER KEY. ' +
    "ONLY common-knowledge sequences a young child verifies from daily life: counting, size order, daily routine (wake→dress→school→sleep), " +
    "plant growth, simple life cycles. NEVER historical dates, niche facts, or anything debatable. Labels unique.",
  "math-clock":
    'Clock items. Each: {mode:"read", instruction, hour:1-12, minute:0 or 30, choices:["h:mm" strings, 2-4], answerIndex}. ' +
    'choices[answerIndex] MUST be exactly the stated time formatted "H:00" or "H:30"; other choices are plausible near-times; choices unique.',
  "math-money":
    'Coin items. Each: {mode:"identify", instruction, coins:[2-6 of penny|nickel|dime|quarter], targetCoin} — targetCoin MUST appear in coins; ' +
    'or {mode:"count", instruction, palette:[1-4 coin types], targetCents:1-100} — targetCents MUST be payable exactly with the palette coins.',
  "math-measure":
    'Measuring items. Each: {mode:"compare", instruction, attribute:"length"|"height"|"weight", question:"most"|"least", ' +
    "items:[{label,emoji,size:0-100}] (2-4), answerIndex} — items[answerIndex].size MUST be the UNIQUE max (most) or min (least); " +
    'or {mode:"units", instruction, unit:"cube"|"paperclip"|"block"|"hand", length:1-12, choices:[ints,2-4], answerIndex} — choices[answerIndex] MUST equal length.',
```

- [ ] **Step 6: Tests.** `src/lib/ai/generated-validators.test.ts`: for each kind, one valid config → null, and each corruption mode → non-null (money: target not in coins / unreachable cents; clock: wrong choice at answerIndex, duplicate choices; measure: tie extreme, wrong answerIndex, wrong units choice; sort: empty bin, duplicate bin id; seq: duplicate labels). Extend each kind's `logic.test.ts` with 1–2 of the same via the exported function. Also assert `isGenerableKind("sort-categories") === true` (etc. for all 5) in `src/lib/ai/practice`'s existing test file, and that the route's `GENERABLE_KINDS` now includes them (it derives from `isGenerableKind` — confirm the derivation test).

- [ ] **Step 7: Full gate + commit.**
```bash
git add src/content/types.ts src/activities/ src/lib/ai/
git commit -m "feat(ai): all five authored-only kinds generable with deterministic answer-key validators (B3)"
```

---

### Task 3: ds4 routes + `generateLessonBatch` + `ensureLessonPractice` server action

**Files:**
- Modify: `src/lib/ai/models.ts:24-25` (route constants + the stale comment); `src/lib/tutor/store.ts` (persist/read/count helpers); `src/app/(learner)/actions.ts` (the action)
- Create: `src/lib/tutor/shelf.ts`
- Test: `src/lib/tutor/shelf.test.ts` + extend `src/app/(learner)/actions.test.ts` (or `store.test.ts` — follow where recordAttempt-adjacent tests live)

**Interfaces:**
- Consumes: `generatedActivity` (Task 1), `generatePracticeItems` + `MODEL_FOR_BAND` (Task 2-filtered), `getCompletedActivityIds`, `resolveLearnerProgram`, `withAccount`/tenancy helpers, `getEnrollmentForGate`/enrollment config reads (grep the real names in `store.ts`/`actions.ts` and reuse).
- Produces:
  - `SHELF_BATCH = 4`, `SHELF_LESSON_CAP = 8` (in `shelf.ts`).
  - `pickGenerationTargets(lesson: Lesson, batch: number): { kind: ActivityKind; focus: string; skillTags: SkillTag[]; sourceTitle: string; n: number }[]` (pure).
  - `ensureLessonPractice(input: { learnerId: string; programSlug: string; activityId?: string; lessonId?: string; more?: boolean }): Promise<{ ok: boolean; items: ShelfItem[] }>` server action.
  - `ShelfItem = { id: string; lessonId: string; unitKey: string; kind: ActivityKind; title: string; skillTags: string[]; createdAt: string }`.
  - Store: `insertGeneratedActivities(accountId, learnerId, rows[]): Promise<ShelfItem[]>` (one tx, tenancy inside), `listGeneratedShelf(accountId, learnerId, programSlug): Promise<ShelfItem[]>`, `countGeneratedForLesson(tx-or-db, learnerId, lessonId): Promise<number>`, `getGeneratedActivity(accountId, learnerId, id)` (Task 4 uses it).

- [ ] **Step 1: Routes.** In `src/lib/ai/models.ts` replace lines 24-25 and rewrite the routes doc-comment truthfully:

```ts
export const TUTOR_FAST = "ds4-fast" as const;
export const TUTOR_RICH = "ds4" as const;
```

Comment: DeepSeek V4 on the homelab LiteLLM gateway (B3 §3); `ds4-fast` serves the ready band, `ds4` the stretch band; `ha-assist` remains configured on the gateway but unused by the tutor; reasoning routes still avoided for the JSON path.

- [ ] **Step 2: Pure target picker** in `src/lib/tutor/shelf.ts`:

```ts
import { isGenerableKind } from "@/lib/ai/practice";
import { getSkill } from "@/content";
import type { Lesson, SkillTag } from "@/content";
import type { ActivityKind } from "@/content/activity-configs";

export const SHELF_BATCH = 4;
export const SHELF_LESSON_CAP = 8;

export interface GenerationTarget {
  kind: ActivityKind;
  focus: string;
  skillTags: SkillTag[];
  sourceTitle: string;
  n: number;
}

/**
 * Choose what to generate for a completed lesson (B3 §5.1): group the lesson's
 * GENERABLE activities by kind, split `batch` across the groups (earlier
 * groups get the remainder), focus = the primary skill's label (the same
 * derivation as ActivityHost's explore path). Deterministic, pure.
 */
export function pickGenerationTargets(lesson: Lesson, batch: number): GenerationTarget[] {
  const generable = lesson.activities.filter((a) => isGenerableKind(a.kind));
  if (generable.length === 0 || batch <= 0) return [];
  const byKind = new Map<ActivityKind, (typeof generable)[number]>();
  for (const a of generable) if (!byKind.has(a.kind)) byKind.set(a.kind, a);
  const groups = [...byKind.values()];
  const base = Math.floor(batch / groups.length);
  const extra = batch % groups.length;
  return groups
    .map((a, i) => ({
      kind: a.kind,
      focus: (a.skillTags[0] ? getSkill(a.skillTags[0])?.label : undefined) ?? a.title,
      skillTags: a.skillTags,
      sourceTitle: a.title,
      n: base + (i < extra ? 1 : 0),
    }))
    .filter((t) => t.n > 0);
}
```

- [ ] **Step 3: Store helpers** in `src/lib/tutor/store.ts` — `insertGeneratedActivities` (tenancy check inside the same tx, mirror `applyPlacement`'s inline ownership pattern; insert all rows; return ShelfItems), `listGeneratedShelf` (via `withOwnedLearner`, ordered `createdAt asc`, mapped to ShelfItem + a `completed` boolean is NOT stored here — completion derives from attempts client-side), `countGeneratedForLesson`, `getGeneratedActivity` (ownership-checked single row incl. `config` + `kind`). Mirror the file's existing read/write idioms exactly.

- [ ] **Step 4: The action** in `src/app/(learner)/actions.ts` (calm `ok:false` posture like its siblings; zod input schema; NO client-supplied model/band/focus — everything derived server-side):

```ts
const ensureLessonPracticeSchema = z.object({
  learnerId: z.string().min(1).max(100),
  programSlug: z.string().min(1).max(100),
  activityId: z.string().min(1).max(100).optional(),
  lessonId: z.string().min(1).max(100).optional(),
  more: z.boolean().optional(),
});

export async function ensureLessonPractice(
  input: z.infer<typeof ensureLessonPracticeSchema>,
): Promise<{ ok: boolean; items: ShelfItem[] }> {
  const parsed = ensureLessonPracticeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, items: [] };
  const { learnerId, programSlug, activityId, lessonId, more } = parsed.data;
  try {
    return await withAccount(async (accountId) => {
      // 1. Gates: same posture as /api/practice — owned learner, ACTIVE
      //    enrollment, neither aiPractice flag === false. (Reuse the exact
      //    helpers route.ts uses; grep its gate block and mirror.)
      // 2. Resolve the learner's pinned tree; locate the lesson (by lessonId,
      //    or the lesson containing activityId). Unknown → { ok:false }.
      // 3. Completion witness: every activity id in that lesson ∈
      //    getCompletedActivityIds(accountId, learnerId) (authored,
      //    non-generated completions). Incomplete → { ok:true, items: existing }
      //    (calm no-op — the client calls this after every completion).
      // 4. Shelf state: existing = listGeneratedShelf(...) filtered to this
      //    lesson. If (!more && existing.length > 0) return existing.
      //    If existing.length >= SHELF_LESSON_CAP return existing.
      // 5. Targets: pickGenerationTargets(lesson,
      //    Math.min(SHELF_BATCH, SHELF_LESSON_CAP - existing.length)).
      //    Band from enrollment config (config.band ?? "ready").
      // 6. For each target: generatePracticeItems(kind, band, focus, n,
      //    { skillHints: skillTags }) — already validator-filtered (Task 2).
      //    A target that throws is skipped (captureNonCritical) — short batch OK.
      // 7. insertGeneratedActivities(...) one tx: title = `Fresh: ${sourceTitle}`,
      //    unitKey/lessonId from the resolved lesson, skillTags from the target,
      //    provenance { genModel: MODEL_FOR_BAND[band], genRoute: "shelf",
      //    genAt: new Date() }.
      // 8. Return { ok: true, items: existing + inserted }.
    });
  } catch (error) {
    captureNonCritical("ensureLessonPractice failed", error);
    return { ok: false, items: [] };
  }
}
```

(The numbered comments are the required behaviors — implement each with the file's real helpers; every one is asserted by a test in Step 5. `withAccount`'s real signature is single-callback (see C1's Task-5 finding) — mirror the sibling actions.)

- [ ] **Step 5: Tests** (mocked-db harness like the recordAttempt tests): tenancy (foreign account → ok:false, zero writes); gate off (`aiPractice:false` on either flag → ok:false, no model call); incomplete lesson → no generation; idempotency (existing batch + `more` absent → returns existing, no insert); cap (8 existing + `more` → no insert); batch math (`pickGenerationTargets`: 1-kind lesson → one target n=4; 3-kind → 2/1/1; non-generable-only lesson → []); a generator throw on one target still persists the other targets' items.

- [ ] **Step 6: Full gate + commit.**
```bash
git add src/lib/ai/models.ts src/lib/tutor/ "src/app/(learner)/actions.ts" "src/app/(learner)/actions.test.ts"
git commit -m "feat(tutor): ds4 routes + ensureLessonPractice — eager, bounded, idempotent shelf generation (B3)"
```

---

### Task 4: Play route + recording + stars-earn-once witness

**Files:**
- Create: `src/app/(learner)/learn/[programSlug]/generated/[generatedId]/page.tsx`, `src/components/learner/GeneratedPracticeHost.tsx`
- Modify: `src/app/(learner)/actions.ts` (`recordAttemptAction` gains the shelf witness), `src/lib/tutor/store.ts` (`RecordAttemptInput.shelfEligible` + earn logic), `src/components/learner/useLearnerState.ts` (`record()` shelf handling)
- Test: extend `src/lib/tutor/store.test.ts` + `src/app/(learner)/actions.test.ts`

**Interfaces:**
- Consumes: `getGeneratedActivity` (Task 3), `getActivityType` from the registry (client side), `recordAttemptAction`/`recordAttempt` (existing), `RewardScreen`/`useLearnerState` idioms from `ActivityHost.tsx`.
- Produces: route `/learn/[programSlug]/generated/[generatedId]`; `RecordAttemptInput.shelfEligible?: boolean` (server-derived only); `record()` option `{ generated: true, shelfItemId: string }` that ALSO applies the completed/stars optimistic updates keyed by the generated id.

- [ ] **Step 1: The page** (dynamic server component; account-only — a guest/foreign id renders the calm "moved" state, mirroring the authored route's posture):

```tsx
export default async function GeneratedActivityPage({ params }: Props) {
  const { programSlug, generatedId } = await params;
  // Lazy per-request session (build-safe). No session → the kid-calm moved state.
  const session = await getSessionOrNull();
  const row = session
    ? await getGeneratedActivityForAccount(session.user.id, programSlug, generatedId)
    : null;
  // row: { id, learnerId, unitKey, lessonId, kind, title, config, skillTags } | null
  return <GeneratedPracticeHost programSlug={programSlug} row={row} />;
}
```

(`getGeneratedActivityForAccount` = a thin store read: the row whose learner belongs to this account AND programSlug matches; reuse the ownership idiom. The page must not import client-only modules besides the host component.)

- [ ] **Step 2: The host** — `GeneratedPracticeHost.tsx` (client): resolves `getActivityType(row.kind)`, zod-parses `row.config` via the type's schema (parse failure → the calm moved state), renders the Player full-screen inside `AppShellKid` with the unit's world via `backHref = /learn/${programSlug}/${row.unitKey}`; on complete: `record(...)` with `{ generated: true, shelfItemId: row.id }` using activityId = `row.id`, kind = `row.kind`, the score, and the row's provenance is NOT client-supplied (server already has it — the attempt's gen fields come from the recorded provenance param exactly as ActivityHost's practice path does; pass `gen: null` and let the server-side witness annotate, OR pass the stored provenance through the page props — pick the simpler: page passes `{ model: row.genModel, route: row.genRoute, at: row.genAt }` and the client relays it like ActivityHost's `opts.gen`). Then show `RewardScreen` with `backHref` (no `canGenerate` — no nested generation from a generated item). Structure/mirror `ActivityHost`'s phases minimally: `playing → reward`.

- [ ] **Step 3: Server witness.** In `recordAttemptAction` (`src/app/(learner)/actions.ts` — the block that computes `unitId`/`creditEligible`): when `generated === true`, look up the activityId in `generated_activity` for this learner (`getGeneratedActivity`); if found, set `shelfEligible = true` and `unitId` = the row's unitKey. Pass `shelfEligible` into `recordAttempt`. In `src/lib/tutor/store.ts`: `RecordAttemptInput.shelfEligible?: boolean` (doc: server-derived only, never client-supplied — same contract as `creditEligible`); the star-earn block's eligibility becomes `input.creditEligible || input.shelfEligible === true`, and its first-completion dedupe must count PRIOR GENERATED attempts for the same activityId too when `shelfEligible` (grep `earnedStarsForAttempt` in `src/lib/rewards/logic.ts` — extend its "prior attempt exists" query/logic so a shelf item earns exactly once; keep authored semantics byte-identical when `shelfEligible` is falsy).

- [ ] **Step 4: Client credit.** In `useLearnerState.ts` `record()`: accept `opts.shelfItemId?: string`; when set (account mode), ALSO run the `setAccountCompleted`/`setAccountStars` optimistic updates keyed by `activity.id` (the generated id) — the C1 checkpoint-skip logic is untouched (a generated shelf item is never in a checkpoint unit; keep the existing `isCheckpointActivity` guard as-is).

- [ ] **Step 5: Tests.** Store: shelf attempt with `shelfEligible` earns stars once (second completion earns 0); foreign learner's generated id → `shelfEligible` never set (action test: witness lookup scoped by learner); authored path byte-unchanged when `shelfEligible` absent (existing tests stay green). Action: `recordAttemptAction` with a forged generated activityId belonging to another learner records the attempt but earns nothing.

- [ ] **Step 6: Full gate + commit.**
```bash
git add "src/app/(learner)/" src/components/learner/GeneratedPracticeHost.tsx src/lib/tutor/ src/components/learner/useLearnerState.ts
git commit -m "feat(learner): play generated shelf items — dedicated route + stars-earn-once witness (B3)"
```

---

### Task 5: Shelf UI + recommender fallback + More-button gate

**Files:**
- Modify: `src/components/learner/useLearnerState.ts` (+`generatedShelf` state from `getLearnerStateAction`), `src/app/(learner)/actions.ts` (`getLearnerStateAction` returns the shelf), `src/components/learner/UnitView.tsx` (the shelf section), `src/components/learner/StudioHome.tsx` (next-thing fallback + the eager trigger call), `src/components/learner/ActivityHost.tsx` (More gate + eager trigger)
- Test: extend `src/lib/tutor/recommend.test.ts`-adjacent tests if present; component logic covered via pure helpers

**Interfaces:**
- Consumes: `ShelfItem` + `ensureLessonPractice` (Task 3); play route (Task 4).
- Produces: `useLearnerState` exposes `generatedShelf: ShelfItem[]` (account mode; `[]` guest) + `refreshShelf()`; pure helper `nextGeneratedPick(shelf: ShelfItem[], completed: Set<string>): ShelfItem | undefined` in `src/lib/tutor/shelf.ts`.

- [ ] **Step 1: Thread the shelf.** `getLearnerStateAction` additionally returns `generatedShelf: await listGeneratedShelf(accountId, learnerId, programSlug)`; `useLearnerState` stores it (`EMPTY []` in guest mode) and re-loads with the existing `loadAccountState` reconcile.

- [ ] **Step 2: Eager trigger.** In `ActivityHost.tsx`, after a NON-generated account-mode completion is recorded (the same place `record(effectiveActivity, ...)` is called for authored items), fire-and-forget:

```ts
      if (signedIn && selectedLearnerId) {
        void ensureLessonPractice({
          learnerId: selectedLearnerId,
          programSlug,
          activityId: effectiveActivity.id,
        }).catch(() => {});
      }
```

(The server no-ops unless this completed the lesson — idempotent by design.)

- [ ] **Step 3: More-button gate.** In `ActivityHost.tsx:281`, extend `canGenerate` with `isGenerableKind(effectiveActivity.kind)` (import from `@/lib/ai/practice` — it is server-safe/pure; verify no client-bundle issue, else re-export the predicate from a shared pure module) so the button never renders for a kind that would 502.

- [ ] **Step 4: UnitView shelf.** After the authored activities `<ul>` (UnitView.tsx:173), render for account mode:

```tsx
{shelfForUnit.length > 0 && (
  <section className="mt-8">
    <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl font-semibold tracking-tight">
      <SparkleIcon weight="fill" className="size-5 text-honey-deep" aria-hidden />
      Fresh practice, made for you
    </h2>
    <ul className="flex flex-col gap-4">{/* same card layout as authored items,
      href={`/learn/${programSlug}/generated/${item.id}`}, stars via getStars(item.id),
      kind icon via ACTIVITY_META[item.kind] */}</ul>
    {/* One "More like this" Button (variant="soft", size="md") per lesson group,
        hidden when that lesson's shelf count >= SHELF_LESSON_CAP; onClick →
        ensureLessonPractice({ learnerId, programSlug, lessonId, more: true })
        with a pending state, then refreshShelf(). */}
  </section>
)}
```

`shelfForUnit = generatedShelf.filter((s) => s.unitKey === unit.id)`, grouped by `lessonId` (group header = the lesson's title from the unit tree). Static classes, `min-h-11` targets, no PII.

- [ ] **Step 5: Next-thing fallback.** In `StudioHome.tsx:355`, after `topPick = nextBest(...)[0]`: `const generatedPick = topPick ? undefined : nextGeneratedPick(generatedShelf, completed);` — `nextGeneratedPick` (pure, in `shelf.ts`) returns the oldest shelf item whose id ∉ completed. Render the existing `NextThingCard` with the generated item (title, kind icon, reason "Fresh practice, made for you", href to the generated route) when `generatedPick` is set. Add a unit test for `nextGeneratedPick` (oldest-first, skips completed, undefined when none).

- [ ] **Step 6: Full gate + commit.**
```bash
git add src/components/learner/ "src/app/(learner)/actions.ts" src/lib/tutor/shelf.ts src/lib/tutor/shelf.test.ts
git commit -m "feat(learner): Fresh-practice shelf + next-thing fallback + generable-kind More gate (B3)"
```

---

### Task 6: COPPA export + delete wiring

**Files:**
- Modify: `src/lib/tutor/export.ts` (`LearnerExport.generatedActivities` + `ShapeInput` + shape mapping), `src/lib/tutor/store.ts` (`buildLearnerExport` reads the table)
- Test: extend `src/lib/tutor/store.coppa.test.ts` (round-trip + cascade)

- [ ] **Step 1:** Add to `LearnerExport` (and `ShapeInput`, and the shape function — mirror `checkpointResults` from C1 Task 6 exactly):

```ts
  /** AI-generated practice items (B3 §4): what the AI made for this child —
   *  kind, title, config, and full generation provenance. */
  generatedActivities: {
    unitKey: string; lessonId: string; kind: string; title: string;
    config: unknown; skillTags: string[];
    genModel: string; genRoute: string; genAt: string; createdAt: string;
  }[];
```

- [ ] **Step 2:** Add the read to `buildLearnerExport`'s `Promise.all` (`.orderBy(desc(generatedActivity.createdAt))`), map to the shape (`genAt`/`createdAt` → `.toISOString()`).
- [ ] **Step 3:** COPPA test: seeded generated row appears in the export; after `deleteLearner` a select returns `[]` (FK cascade — already guaranteed by Task 1's `onDelete: "cascade"`).
- [ ] **Step 4: Full gate + commit.**
```bash
git add src/lib/tutor/export.ts src/lib/tutor/store.ts src/lib/tutor/store.coppa.test.ts
git commit -m "feat(coppa): generated_activity in learner export + delete cascade (B3)"
```

---

### Task 7: Word Study `skillsAffected` fix

**Files:**
- Modify: `src/activities/phonics-wordbuild/logic.ts` (focus mapping), `src/content/activity-configs.ts` (`sightwordGameConfig` + optional `skillTag`), `src/activities/sightword-game/logic.ts` (`skillsAffected` override), `src/content/programs/kaelyn-adaptive.ts` (set `skillTag` on the Word Study sightword-game activities)
- Test: extend both kinds' `logic.test.ts` + a new invariant test in `src/content/content.test.ts`

**Interfaces:**
- Produces: Word Study activities' `skillsAffected(config)` ⊆ their authored `skillTags`; Program-01 phonics behavior byte-identical.

- [ ] **Step 1: phonics-wordbuild mapping.** In `skillsAffected` (logic.ts:41-49), insert the Word Study checks BEFORE the legacy chain's default, keeping every existing branch untouched (order matters — most-specific first):

```ts
export function skillsAffected(config: PhonicsWordbuildConfig): SkillTag[] {
  const focus = config.focus.toLowerCase();
  // Word Study (grade-1 ramp) focus strings → the authored word.* slugs
  // (B3 §7 — the recommender gates on these; legacy phonics.* misses them).
  if (focus.includes("syllable") && focus.includes("divid")) return ["word.syllables.division"];
  if (focus.includes("syllable")) return ["word.syllables.types"];
  if (focus.includes("prefix")) return ["word.morphology.prefixes"];
  if (focus.includes("root")) return ["word.morphology.roots"];
  // Program-01 phonics (unchanged):
  if (focus.includes("digraph")) return ["phonics.digraphs"];
  if (focus.includes("final") && focus.includes("blend")) return ["phonics.blends.final"];
  if (focus.includes("blend")) return ["phonics.blends.initial"];
  if (focus.includes("diphthong")) return ["phonics.diphthongs"];
  if (focus.includes("ending") || focus.includes("suffix")) return ["phonics.endings"];
  return ["phonics.cvc"];
}
```

FIRST verify by grep that no Program-01 (`summer-k-to-grade1.ts`) phonics-wordbuild focus string contains "syllable"/"prefix"/"root" (would change its evidence — if one does, tighten the new checks to not match it and note it in the report).

- [ ] **Step 2: sightword-game override.** `sightwordGameConfig` gains `skillTag: z.string().min(1).max(64).optional()` (expand-only); `skillsAffected` becomes:

```ts
export function skillsAffected(config: SightwordGameConfig): SkillTag[] {
  return [config.skillTag ?? "reading.decodable"];
}
```

- [ ] **Step 3: Content.** In `kaelyn-adaptive.ts`, for each Word Study `sightword-game` activity set `skillTag` in its config to the activity's OWN first authored `skillTags` entry (grep `kind: "sightword-game"` inside the `word-study` unit; there are 2 — e.g. `word.morphology.prefixes` and `vocab.shades-of-meaning`). Do NOT touch Program-01's sightword games (no `skillTag` → legacy behavior).

- [ ] **Step 4: Invariant test** in `src/content/content.test.ts` (extends C1's load-bearing check to this strand):

```ts
it("Word Study activities' runtime skill evidence targets their authored skillTags", () => {
  const program = PROGRAMS.find((p) => p.slug === "kaelyn-adaptive")!;
  const unit = program.units.find((u) => u.id === "word-study")!;
  for (const lesson of unit.lessons) {
    for (const a of lesson.activities) {
      const type = getActivityType(a.kind);
      const emitted = type.skillsAffected(a.config as never);
      for (const s of emitted) {
        expect(a.skillTags, `${a.id} emits ${s}`).toContain(s);
      }
    }
  }
});
```

(Confirm the unit's real id via grep — use the actual `id`; if some activity legitimately emits a subset, ⊆ is exactly what this asserts.)

- [ ] **Step 5:** Extend both `logic.test.ts` files (wordbuild: each new focus string → the word.* slug, one legacy string → unchanged phonics slug; sightword: with/without `skillTag`). Full gate + commit.
```bash
git add src/activities/ src/content/
git commit -m "fix(word-study): skillsAffected targets the authored word.*/vocab.* skills (B3)"
```

---

### Task 8: E2E smoke + ship (migration, REQUIRED prod re-seed, pilot account, canary)

**Files:**
- Create: `e2e/specs/adaptive-generation.spec.ts`
- Modify: `playwright.config.ts` (register in the matching project `testMatch`)

- [ ] **Step 1: LLM-free e2e.** Mirror the sibling specs' structure/gating:
  - **public project:** a guest completes-or-views an authored generable-kind activity's reward screen → the "More, made just for me" button is NOT present (signed-out gating); `/learn/kaelyn-adaptive/generated/nonexistent-id` renders the calm moved/redirect state (not a 500).
  - **parent project:** signed-in fixture on an authored generable-kind activity reward screen → the More button IS present (do not click — no live generation in the gate). No spec may call the model.
  - Verify discovery: `bunx playwright test --list | grep adaptive` (do NOT run against prod).
- [ ] **Step 2: Full local gate** (`lint`/`typecheck`/`test`/`build`/`audit:dead-code`) → clean. Commit `test(e2e): adaptive-generation affordance smoke (LLM-free)`.
- [ ] **Step 3: Ship.** Push branch, open PR, final whole-branch (opus) + external (codex) reviews, merge-ready gate (`scripts/merge-ready.sh check --pr <n>` — frontend-touching → impeccable applies), **USER-CONFIRMED merge**. Migration auto-runs via the initContainer.
- [ ] **Step 4: REQUIRED prod re-seed** (Task 7 edited `kaelyn-adaptive.ts`; curriculum is DB-preferred): port-forward `svc/kaelyns-academy-db-rw` + `DATABASE_URL=<db-app uri, host→127.0.0.1:55432, drop sslmode> bun scripts/seed-content.ts`; verify the Word Study sightword configs in prod carry `skillTag`.
- [ ] **Step 5: Pilot account rollout (the guest-mode lesson).** USER creates the real parent account + Kaelyn's learner + enrollment and signs her device in. Then verify server-side: learner + ACTIVE `kaelyn-adaptive` enrollment exist; neither `aiPractice` flag is `false`.
- [ ] **Step 6: Canary.** `/api/health` 200 (canary includes the new table's columns); complete a lesson on the pilot account (or the e2e parent fixture) on a generable kind → `generated_activity` rows appear (≤4, validated), the "Fresh practice" shelf renders, playing one earns stars once; pod logs clean; LiteLLM `ds4`/`ds4-fast` calls visible in the gateway logs.

---

## Self-Review Notes (applied)

- **Spec coverage:** §3 routes → Task 3; §4 table/COPPA → Tasks 1+6; §5.1 eager → Tasks 3+5; §5.2 more/cap → Tasks 3+5; §5.3 shelf/recommender/play/stars/guest → Tasks 4+5; §6 briefs+validators+More-gate → Tasks 2+5; §7 Word Study → Task 7; §8 posture → Tasks 2-5 constraints; §9 testing → per-task + Task 8; §10 deploy/rollout → Task 8; §11 non-goals honored (no curriculum-tree writes, no new kinds, no baseline changes).
- **Type consistency:** `ShelfItem`, `ensureLessonPractice(input)`, `SHELF_BATCH/SHELF_LESSON_CAP`, `pickGenerationTargets`, `nextGeneratedPick`, `VALIDATE_GENERATED`, `validateGenerated`, `RecordAttemptInput.shelfEligible`, route `/learn/[programSlug]/generated/[generatedId]` are consistent across producing/consuming tasks.
- **Ordering:** schema (T1) → generation safety (T2) → server loop (T3) → play/credit (T4) → UI (T5) → COPPA (T6) → Word Study (T7, independent) → ship (T8). Each ends full-suite green.
- **Judgment calls implementers must not "fix":** validators are deterministic (no LLM-judge); short/empty batches are acceptable (never persist an invalid item); `shelfEligible`/`checkpointPhase`/`creditEligible` are server-derived only; the eager trigger is fire-and-forget + server-idempotent; generated items live OUTSIDE the authored tree; guest mode gets no shelf; seq-order factuality is constrained via the brief (accepted residual); Program-01 phonics evidence must remain byte-identical.
