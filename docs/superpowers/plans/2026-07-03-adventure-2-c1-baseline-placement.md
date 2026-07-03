# Adventure 2.0 C1 — Baseline Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-time, forgiving per-strand "show what you know" check-in whose first-try result, once a parent confirms it, pre-seeds `skill_state` so the existing recommender starts a learner at her real level.

**Architecture:** A new `checkpoint_result` table captures per-skill first-try signal from attempts in a `checkpoint:"baseline"` unit (folded there INSTEAD of `skill_state`, so nothing changes pre-confirm). A pure placement engine maps those scores to a seed set (forward-only threshold rule). A parent-confirmed `applyPlacement` action seeds `skill_state` with a `source:"baseline"` provenance; the untouched recommender then skips the mastered rungs. One additive change to the mastery engine carries the provenance so the report shows "placed" vs "mastered".

**Tech Stack:** Next.js 16 (App Router, Server Actions), TypeScript strict, Drizzle ORM (Postgres/CNPG), Vitest, Playwright, bun.

## Global Constraints

- **bun only** — never npm/yarn/pnpm. `bun run lint && bun run typecheck && bun run test && bun run build` + `bun run audit:dead-code` must be clean before merge.
- **Build-safety:** never call `getDb()`/`getAuth()` at module top level — lazy per-request only.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`, `// noqa`) or leave a warning — fix the root cause.
- **Child-data posture (§8):** no child PII beyond display name + birth month; no open-ended child↔LLM chat. Every new learner-state table is added to the COPPA export + delete in the SAME PR that creates it (§3.7).
- **Placement thresholds (§6):** `BREEZED_MIN = 0.8`, `MIXED_MIN = 0.5`. `rate ≥ 0.8` → seed solid; else do not seed. **Forward-only** — baseline never places below the start.
- **No auto-apply (§13):** a parent always confirms before any placement applies.
- **Report honesty (§8 spec):** a placed skill carries `source:"baseline"` and is shown as "placed from check-in", never "mastered".
- **DB-preferred curriculum:** the 3 authored check-in units ride `seed-content.ts` → **required prod re-seed after merge** (Task 8).
- Each task adds its code AND wiring in ONE commit and ends with the FULL suite green (no RED window). Reuse existing helpers; never duplicate a logic block.
- Phosphor icons only (never Lucide); static Tailwind class maps only; forgiving scoring via `_shared/scoring.ts` only.

---

## File Structure

- `src/lib/db/schema.ts` — add `checkpointResult` pgTable; extend `skillState.evidence` `$type` with optional `source`.
- `drizzle/NNNN_*.sql` + journal — generated migration for the new table.
- `src/lib/db/health.ts` — register the new table's required columns in the schema-drift canary.
- `src/lib/placement/placement.ts` (+ `.test.ts`) — the pure engine (`outcomeToRate`, `computePlacement`).
- `src/lib/tutor/mastery.ts` — evidence `source` on `SkillRecord.history` (additive; `deriveOutcome` logic unchanged).
- `src/lib/tutor/store.ts` — `nextSkillRecord` threads `source`; `recordAttempt` folds baseline attempts into `checkpoint_result`; new `upsertCheckpointScore`, `getPendingCheckpointResults`, `applyPlacement`, `redoCheckpoint`; `buildLearnerExport`/`deleteLearner` cover the new table.
- `src/app/(learner)/actions.ts` — `recordAttemptAction` resolves `unit.checkpoint` and threads `checkpointPhase`.
- `src/app/(parent)/data.ts` — `getPendingCheckpointResults` shaping + `SkillStatus.source`.
- `src/app/(parent)/parent/learners/[id]/CheckpointResultsPanel.tsx` (+ wiring in `page.tsx`) — the parent panel; `applyPlacementAction`/`redoCheckpointAction` in `(parent)` actions.
- `src/lib/tutor/export.ts` — `LearnerExport.checkpointResults` + shape.
- `src/content/programs/kaelyn-adaptive.ts` — the 3 `checkpoint:"baseline"` units.
- `e2e/specs/baseline-placement.spec.ts` (+ `playwright.config.ts`) — smoke.

---

## Task 1: `checkpoint_result` table + evidence `source` field + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (add table after `skillState`, ~line 216; extend `skillState.evidence` `$type`)
- Modify: `src/lib/db/health.ts` (register required columns)
- Create: `drizzle/<generated>.sql` (via `bun run db:generate`)
- Test: `src/lib/db/schema.test.ts` (create if absent) or extend an existing schema/health test

**Interfaces:**
- Produces: `checkpointResult` pgTable; `CheckpointResultRow` = `typeof checkpointResult.$inferSelect`; `CheckpointPhase = "baseline" | "mid" | "final"`; `skillState.evidence` entries typed `{ day: string; outcome: string; source?: "play" | "baseline" }`.

- [ ] **Step 1: Add the table + evidence source to `schema.ts`.** After the `skillState` table block (immediately after its closing `);` near line 216), add:

```ts
/**
 * Assessment capture (Adventure 2.0 Phase C, spec §3.5). One row per
 * (learner, checkpoint unit, phase) — the per-skill first-try signal from a
 * baseline/mid/final check-in. Baseline attempts fold here INSTEAD of
 * skill_state (nothing changes about the learner's level until a parent applies
 * the placement). `status` tracks the parent gate: pending → applied | dismissed.
 */
export const checkpointResult = pgTable(
  "checkpoint_result",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
    /** The authored checkpoint unit's stable id (e.g. "reading-baseline"). */
    unitId: text("unit_id").notNull(),
    /** baseline | mid | final. C1 only writes "baseline". */
    phase: text("phase").notNull(),
    /** Per-skill first-try rate 0..1, keyed by skill slug. */
    scores: jsonb("scores").$type<Record<string, number>>().notNull().default({}),
    /** pending | applied | dismissed — the parent-confirmation gate. */
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [
    // One live result per (learner, checkpoint unit, phase); Redo deletes the
    // row so the check-in can be re-taken.
    uniqueIndex("checkpoint_result_learner_unit_phase_uq").on(t.learnerId, t.unitId, t.phase),
    index("checkpoint_result_learner_idx").on(t.learnerId),
  ],
);
```

Then extend the `skillState.evidence` column `$type` (line ~202-205) from `{ day: string; outcome: string }[]` to:

```ts
    evidence: jsonb("evidence")
      .$type<{ day: string; outcome: string; source?: "play" | "baseline" }[]>()
      .notNull()
      .default([]),
```

- [ ] **Step 2: Register the table in the health canary.** In `src/lib/db/health.ts`, find `REQUIRED_COLUMNS` (the schema-drift map) and add an entry mirroring the sibling tables' style:

```ts
  checkpoint_result: ["id", "learner_id", "enrollment_id", "unit_id", "phase", "scores", "status", "created_at", "applied_at"],
```

(If `health.ts` derives columns differently, follow its existing pattern for one table; grep `REQUIRED_COLUMNS` and match it exactly.)

- [ ] **Step 3: Generate the migration.** Run: `bun run db:generate`
Expected: a new `drizzle/NNNN_*.sql` creating `checkpoint_result` with its two indexes, and the journal advances by one. The `evidence` `$type` change is jsonb-internal → no column migration for it (verify the generated SQL contains only the `CREATE TABLE checkpoint_result` + indexes; if drizzle emits anything about `skill_state`, inspect — it should not).

- [ ] **Step 4: Write a schema-presence test.** In `src/lib/db/schema.test.ts` (create if absent):

```ts
import { describe, expect, it } from "vitest";
import { checkpointResult } from "./schema";

describe("checkpoint_result schema", () => {
  it("exposes the Phase C capture columns", () => {
    const cols = Object.keys(checkpointResult);
    for (const c of ["id", "learnerId", "enrollmentId", "unitId", "phase", "scores", "status", "createdAt", "appliedAt"]) {
      expect(cols).toContain(c);
    }
  });
});
```

- [ ] **Step 5: Run the gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build`
Expected: PASS (785+ tests). If health.ts has a test asserting the canary set, it now includes `checkpoint_result` — confirm it passes.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/db/schema.ts src/lib/db/health.ts src/lib/db/schema.test.ts drizzle/
git commit -m "feat(db): checkpoint_result table + skill_state evidence source (Phase C1)"
```

---

## Task 2: Placement engine (pure)

**Files:**
- Create: `src/lib/placement/placement.ts`
- Test: `src/lib/placement/placement.test.ts`

**Interfaces:**
- Consumes: `SkillTag`, `SkillOutcome` from `@/content`.
- Produces:
  - `outcomeToRate(outcome: SkillOutcome): number` — `solid→1`, `emerging→0.5`, `not_yet→0`.
  - `type PlacementBand = "breezed" | "mixed" | "not_yet"`
  - `interface PlacementVerdict { skill: SkillTag; rate: number; band: PlacementBand }`
  - `interface Placement { seed: SkillTag[]; verdicts: PlacementVerdict[] }`
  - `computePlacement(scores: Record<string, number>): Placement`
  - Constants `BREEZED_MIN = 0.8`, `MIXED_MIN = 0.5`.

- [ ] **Step 1: Write the failing test.** `src/lib/placement/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BREEZED_MIN, computePlacement, outcomeToRate } from "./placement";

describe("outcomeToRate", () => {
  it("maps outcomes to first-try rate", () => {
    expect(outcomeToRate("solid")).toBe(1);
    expect(outcomeToRate("emerging")).toBe(0.5);
    expect(outcomeToRate("not_yet")).toBe(0);
  });
});

describe("computePlacement", () => {
  it("seeds only breezed skills (rate >= 0.8) and bands the rest", () => {
    const p = computePlacement({ "math.add": 1, "math.sub": 0.6, "math.mult": 0.2 });
    expect(p.seed).toEqual(["math.add"]);
    expect(p.verdicts).toEqual([
      { skill: "math.add", rate: 1, band: "breezed" },
      { skill: "math.sub", rate: 0.6, band: "mixed" },
      { skill: "math.mult", rate: 0.2, band: "not_yet" },
    ]);
  });
  it("is forward-only: all-low scores seed nothing", () => {
    expect(computePlacement({ "a.x": 0.4, "a.y": 0 }).seed).toEqual([]);
  });
  it("threshold is inclusive at BREEZED_MIN", () => {
    expect(computePlacement({ "a.x": BREEZED_MIN }).seed).toEqual(["a.x"]);
  });
  it("handles an empty score map", () => {
    expect(computePlacement({})).toEqual({ seed: [], verdicts: [] });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `bun run test src/lib/placement/placement.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `placement.ts`.**

```ts
import type { SkillOutcome, SkillTag } from "@/content";

/**
 * The C1 placement engine (pure, framework-free — mirrors mastery.ts). It maps
 * a baseline check-in's per-skill first-try rate to the set of skills to
 * pre-seed as solid, and a per-skill verdict for the parent panel. Forward-only:
 * it only ever proposes SKIPPING review; it never places a learner below the
 * start.
 */

/** A single probe item's outcome → a first-try rate the thresholds key on. */
export function outcomeToRate(outcome: SkillOutcome): number {
  if (outcome === "solid") return 1;
  if (outcome === "emerging") return 0.5;
  return 0;
}

/** rate >= this → she owns the skill (seed solid). */
export const BREEZED_MIN = 0.8;
/** rate in [MIXED_MIN, BREEZED_MIN) → she'll practice it (do not seed). */
export const MIXED_MIN = 0.5;

export type PlacementBand = "breezed" | "mixed" | "not_yet";

export interface PlacementVerdict {
  skill: SkillTag;
  rate: number;
  band: PlacementBand;
}

export interface Placement {
  /** Skills to pre-seed as solid on apply (forward-only). */
  seed: SkillTag[];
  /** Per-skill verdicts, one per entry in `scores`, in insertion order. */
  verdicts: PlacementVerdict[];
}

function bandOf(rate: number): PlacementBand {
  if (rate >= BREEZED_MIN) return "breezed";
  if (rate >= MIXED_MIN) return "mixed";
  return "not_yet";
}

export function computePlacement(scores: Record<string, number>): Placement {
  const verdicts: PlacementVerdict[] = Object.entries(scores).map(([skill, rate]) => ({
    skill,
    rate,
    band: bandOf(rate),
  }));
  return { seed: verdicts.filter((v) => v.band === "breezed").map((v) => v.skill), verdicts };
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `bun run test src/lib/placement/placement.test.ts` → PASS.

- [ ] **Step 5: Full gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code` → clean (knip: `placement.ts` is consumed in Task 4, so it may report unused now — acceptable ONLY if you land Task 2+4 without a knip gate between them; to keep every task green, add a `// eslint`-free re-export is NOT allowed. Instead: land this task's commit, and if knip flags `computePlacement` as unused, proceed — knip is attested at ship time, not per-task. Do NOT add a fake consumer.)

Note: if `bun run audit:dead-code` fails ONLY on `placement.ts` exports being unused, that is expected until Task 4 wires them; the per-task green bar is lint+typecheck+test+build. Record this in the report.

- [ ] **Step 6: Commit.**
```bash
git add src/lib/placement/
git commit -m "feat(placement): pure baseline placement engine (threshold rule, forward-only)"
```

---

## Task 3: Capture — baseline attempts fold into `checkpoint_result`, not `skill_state`

**Files:**
- Modify: `src/lib/tutor/store.ts` (`RecordAttemptInput`, `recordAttempt`; add `upsertCheckpointScore`)
- Modify: `src/app/(learner)/actions.ts` (`recordAttemptAction` resolves `unit.checkpoint`, threads `checkpointPhase`)
- Test: `src/lib/tutor/store.test.ts` (baseline attempt → checkpoint_result, not skill_state)

**Interfaces:**
- Consumes: `checkpointResult` (Task 1), `outcomeToRate` (Task 2), `findUnitIdOfActivity` + a unit lookup from `@/content`.
- Produces: `RecordAttemptInput.checkpointPhase?: "baseline" | "mid" | "final" | null`; when set to `"baseline"`, `recordAttempt` writes to `checkpoint_result` and SKIPS the skill_state + quest folds.

- [ ] **Step 1: Add the capture helper + input field in `store.ts`.** Add `checkpointResult` to the schema imports. Add to `RecordAttemptInput` (after `unitId?`):

```ts
  /**
   * When the attempt's unit is a checkpoint (baseline/mid/final), its evidence
   * folds into checkpoint_result INSTEAD of skill_state — nothing about the
   * learner's level changes until a parent applies the placement (§3, §7).
   * Resolved server-side by the action from the unit's authored `checkpoint`.
   */
  checkpointPhase?: "baseline" | "mid" | "final" | null;
```

Add the helper (near `nextSkillRecord`):

```ts
/**
 * Fold one checkpoint attempt's per-skill outcomes into the (learner, unit,
 * phase) checkpoint_result row as first-try rates. Upserts the row (status
 * "pending"); merges the new per-skill rates into the existing scores map. Does
 * NOT touch skill_state (placement is parent-gated).
 */
async function upsertCheckpointScore(
  tx: DbTx,
  learnerId: string,
  enrollmentId: string,
  unitId: string,
  phase: string,
  evidence: { skill: string; outcome: string }[],
): Promise<void> {
  await tx
    .insert(checkpointResult)
    .values({ learnerId, enrollmentId, unitId, phase, scores: {}, status: "pending" })
    .onConflictDoNothing({
      target: [checkpointResult.learnerId, checkpointResult.unitId, checkpointResult.phase],
    });
  const rows = await tx
    .select()
    .from(checkpointResult)
    .where(
      and(
        eq(checkpointResult.learnerId, learnerId),
        eq(checkpointResult.unitId, unitId),
        eq(checkpointResult.phase, phase),
      ),
    )
    .limit(1)
    .for("update");
  const row = rows[0];
  if (!row) return;
  const scores = { ...row.scores };
  for (const ev of evidence) {
    scores[ev.skill] = outcomeToRate(ev.outcome as SkillOutcome);
  }
  await tx.update(checkpointResult).set({ scores }).where(eq(checkpointResult.id, row.id));
}
```

(Use the transaction type the file already uses for `tx`; grep for how other helpers type the `tx` param — reuse it, do not invent `DbTx` if the file uses an inline type. `outcomeToRate` imported from `@/lib/placement/placement`.)

- [ ] **Step 2: Branch the fold in `recordAttempt`.** The enrollment gate already resolves the active enrollment (the row locked near line 201-212 — capture its `id` as `enrollmentId`). Immediately BEFORE the skill_state fold loop (the `const evidence = [...input.score.skillEvidence].sort(...)` block near line 270), add the checkpoint branch and gate the existing folds:

```ts
    // Checkpoint attempts (baseline/mid/final) capture to checkpoint_result and
    // do NOT advance skill_state or quests — placement is parent-gated (§3).
    if (input.checkpointPhase) {
      await upsertCheckpointScore(
        tx,
        input.learnerId,
        enrollmentId,
        input.unitId ?? "",
        input.checkpointPhase,
        input.score.skillEvidence,
      );
    } else {
      const evidence = [...input.score.skillEvidence].sort((a, b) => a.skill.localeCompare(b.skill));
      // ... existing skill_state fold loop unchanged ...
      // ... existing quest fold (questEligible) unchanged ...
    }
```

Wrap the EXISTING skill_state fold loop AND the quest fold block in that `else`. The star-ledger earn ABOVE stays as-is (a checkpoint activity still earns activity stars — it's ordinary play to the child). `enrollmentId` must be the id from the active-enrollment row already selected by the gate; if the gate select doesn't currently return `id`, add `id` to its selection.

- [ ] **Step 3: Thread `checkpointPhase` from the action.** In `src/app/(learner)/actions.ts` `recordAttemptAction`, after `unitId` is resolved (line ~241) and `program` is in scope, resolve the unit's checkpoint phase and pass it:

```ts
      const unit = program && unitId ? getUnit(program, unitId) : null;
      const checkpointPhase = unit?.checkpoint ?? null;
```

Add `getUnit` to the `@/content` import. Pass `checkpointPhase` into the `recordAttempt({ ... })` call (alongside `unitId`, `creditEligible`).

- [ ] **Step 4: Write the store test.** In `src/lib/tutor/store.test.ts`, add (mirror the existing recordAttempt tests' setup — a seeded learner + active enrollment + a `checkpoint:"baseline"` unit in the resolved program, or stub the input directly):

```ts
it("a baseline checkpoint attempt captures to checkpoint_result and NOT skill_state", async () => {
  // ...arrange a learner + active enrollment; pick a baseline unit id + a skill...
  await recordAttempt(accountId, {
    learnerId, programSlug, activityId, kind: "sort-categories",
    score: { correct: 1, total: 1, stars: 3, skillEvidence: [{ skill: "math.add", outcome: "solid" }] },
    day: "2026-07-03", creditEligible: true, unitId: "math-baseline", checkpointPhase: "baseline",
  });
  const state = await getSkillState(accountId, learnerId);
  expect(state["math.add"]).toBeUndefined(); // skill_state untouched
  const results = await getPendingCheckpointResults(accountId, learnerId); // from Task 4/5 — if not yet present, assert via a direct select on checkpointResult
  // scores["math.add"] === 1 (solid → rate 1)
});
```

(If `getPendingCheckpointResults` isn't available yet, assert with a direct `getDb().select().from(checkpointResult)` in the test. Keep the assertion: skill_state has no `math.add`; checkpoint_result.scores["math.add"] === 1.)

- [ ] **Step 5: Run the gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build` → PASS. Existing recordAttempt tests (non-checkpoint) must still pass unchanged (the `else` branch is the old behavior).

- [ ] **Step 6: Commit.**
```bash
git add src/lib/tutor/store.ts "src/app/(learner)/actions.ts" src/lib/tutor/store.test.ts
git commit -m "feat(assessment): baseline attempts fold into checkpoint_result, not skill_state"
```

---

## Task 4: `applyPlacement` + mastery `source` provenance

**Files:**
- Modify: `src/lib/tutor/mastery.ts` (`SkillRecord.history` entries gain optional `source`)
- Modify: `src/lib/tutor/store.ts` (`nextSkillRecord` threads `source`; add `getPendingCheckpointResults`, `applyPlacement`, `redoCheckpoint`)
- Test: `src/lib/tutor/store.test.ts` (+ `mastery.test.ts` for the source additive change)

**Interfaces:**
- Consumes: `computePlacement` (Task 2), `checkpointResult` (Task 1).
- Produces:
  - `nextSkillRecord(prior, outcome, day, source?: "play" | "baseline")` — `source` defaults to `"play"`.
  - `interface PendingCheckpoint { id: string; unitId: string; phase: string; verdicts: PlacementVerdict[]; seed: SkillTag[]; status: string; createdAt: string }`
  - `getPendingCheckpointResults(accountId, learnerId): Promise<PendingCheckpoint[]>`
  - `applyPlacement(accountId, checkpointResultId): Promise<void>` — idempotent, tenancy-checked, seeds `skill_state` `source:"baseline"`, flips status→applied.
  - `redoCheckpoint(accountId, checkpointResultId): Promise<void>` — tenancy-checked delete.

- [ ] **Step 1: Add `source` to the mastery evidence shape.** In `src/lib/tutor/mastery.ts`, change `SkillRecord`:

```ts
export interface SkillRecord {
  history: { day: DayKey; outcome: SkillOutcome; source?: "play" | "baseline" }[];
}
```

Make `deriveOutcome` **source-aware**: a `baseline`-sourced solid entry asserts solid immediately (a placement IS an assertion that she owns the skill), while normal play still needs `MASTERY_DISTINCT_DAYS = 2` distinct solid days. Records with no `source` field are unaffected (back-compatible), so every existing test still passes:

```ts
export function deriveOutcome(record: SkillRecord | undefined): SkillOutcome {
  if (!record || record.history.length === 0) return "not_yet";
  const solid = record.history.filter((h) => h.outcome === "solid");
  // A parent-confirmed placement asserts solid without waiting on the day-gate.
  if (solid.some((h) => h.source === "baseline")) return "solid";
  const solidDays = new Set(solid.map((h) => h.day));
  if (solidDays.size >= MASTERY_DISTINCT_DAYS) return "solid";
  return "emerging";
}
```

Add a helper:

```ts
/** True when a skill's solid state came (at least partly) from a placement
 *  check-in rather than day-over-day play — the report labels it "placed". */
export function isPlaced(record: SkillRecord | undefined): boolean {
  return !!record?.history.some((h) => h.source === "baseline");
}
```

Extend `applyEvidence` to accept and store an optional `source` on each entry (default omitted). Add `mastery.test.ts` cases: (a) a record with a single `baseline` solid entry → `deriveOutcome === "solid"` (no day-gate wait); (b) a record with `play` solids on 1 day → still `"emerging"` (gate unchanged); (c) `isPlaced` is true for a baseline-sourced record, false for play-only.

- [ ] **Step 2: Thread `source` through `nextSkillRecord`.** In `store.ts`:

```ts
export function nextSkillRecord(
  prior: { day: string; outcome: string; source?: string }[] | undefined,
  outcome: SkillOutcome,
  day: DayKey,
  source: "play" | "baseline" = "play",
): { history: { day: string; outcome: SkillOutcome; source?: "play" | "baseline" }[]; outcome: SkillOutcome } {
  const entry = source === "baseline" ? { day, outcome, source } : { day, outcome };
  const history = [...(prior ?? []), entry].slice(-MAX_HISTORY) as {
    day: string; outcome: SkillOutcome; source?: "play" | "baseline";
  }[];
  return { history, outcome: deriveOutcome({ history } as SkillRecord) };
}
```

The existing `recordAttempt` call site passes no `source` → defaults to `"play"` (back-compatible).

- [ ] **Step 3: Add the read + apply + redo functions.** In `store.ts`:

```ts
export interface PendingCheckpoint {
  id: string;
  unitId: string;
  phase: string;
  status: string;
  createdAt: string;
  verdicts: PlacementVerdict[];
  seed: SkillTag[];
}

/** All of a learner's checkpoint results (account-scoped), each with its
 *  computed placement verdicts + seed set. */
export async function getPendingCheckpointResults(
  accountId: string,
  learnerId: string,
): Promise<PendingCheckpoint[]> {
  await assertLearnerOwned(accountId, learnerId); // reuse the file's tenancy helper
  const rows = await getDb()
    .select()
    .from(checkpointResult)
    .where(eq(checkpointResult.learnerId, learnerId))
    .orderBy(desc(checkpointResult.createdAt));
  return rows.map((r) => {
    const { seed, verdicts } = computePlacement(r.scores);
    return { id: r.id, unitId: r.unitId, phase: r.phase, status: r.status, createdAt: r.createdAt.toISOString(), verdicts, seed };
  });
}

/**
 * Apply a baseline placement: seed skill_state solid (source "baseline") for the
 * breezed skills and flip the result to "applied". Tenancy-checked and
 * idempotent — a re-apply of an already-applied row is a no-op. One
 * baseline-sourced solid entry per skill is enough: the source-aware
 * deriveOutcome (Step 1) locks it as solid so the recommender skips the rung.
 * The `day` on the seeded entry is the checkpoint result's own creation day.
 */
export async function applyPlacement(accountId: string, checkpointResultId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const rows = await tx.select().from(checkpointResult).where(eq(checkpointResult.id, checkpointResultId)).limit(1).for("update");
    const row = rows[0];
    if (!row) return;
    await assertLearnerOwnedTx(tx, accountId, row.learnerId); // tenancy inside tx
    if (row.status === "applied") return; // idempotent
    const day = row.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
    const { seed } = computePlacement(row.scores);
    for (const skill of seed) {
      await tx
        .insert(skillState)
        .values({ learnerId: row.learnerId, skill, evidence: [], outcome: "not_yet" })
        .onConflictDoNothing({ target: [skillState.learnerId, skillState.skill] });
      const locked = await tx.select().from(skillState).where(and(eq(skillState.learnerId, row.learnerId), eq(skillState.skill, skill))).limit(1).for("update");
      const s = locked[0];
      if (!s) continue;
      const folded = nextSkillRecord(s.evidence, "solid", day, "baseline");
      await tx.update(skillState).set({ evidence: folded.history, outcome: folded.outcome, updatedAt: new Date() }).where(eq(skillState.id, s.id));
    }
    await tx.update(checkpointResult).set({ status: "applied", appliedAt: new Date() }).where(eq(checkpointResult.id, row.id));
  });
}

/** Redo: delete the checkpoint result so the check-in is offered again. Tenancy-checked. */
export async function redoCheckpoint(accountId: string, checkpointResultId: string): Promise<void> {
  const rows = await getDb().select().from(checkpointResult).where(eq(checkpointResult.id, checkpointResultId)).limit(1);
  const row = rows[0];
  if (!row) return;
  await assertLearnerOwned(accountId, row.learnerId);
  await getDb().delete(checkpointResult).where(eq(checkpointResult.id, checkpointResultId));
}
```

(Reuse the file's actual tenancy helpers — grep for how `saveLearnerSettings`/`deleteLearner` verify ownership and mirror it exactly; the names `assertLearnerOwned`/`assertLearnerOwnedTx` are placeholders for whatever the file already uses. Import `computePlacement`, `PlacementVerdict`, `SkillTag`, `desc`.)

- [ ] **Step 4: Tests.** In `store.test.ts`: (a) `applyPlacement` seeds only the breezed skills as solid with `source:"baseline"`, and the seeded skill's `getSkillState` outcome is `"solid"`; (b) re-calling `applyPlacement` is a no-op (status already applied; no duplicate evidence explosion); (c) tenancy — a different account's `applyPlacement` throws/we no-op; (d) `redoCheckpoint` deletes the row. In `mastery.test.ts`: `isPlaced` true for a baseline-sourced record; `deriveOutcome` unchanged for play records.

- [ ] **Step 5: Full gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code` → clean (placement engine is now consumed → knip clean).

- [ ] **Step 6: Commit.**
```bash
git add src/lib/tutor/mastery.ts src/lib/tutor/store.ts src/lib/tutor/store.test.ts src/lib/tutor/mastery.test.ts
git commit -m "feat(assessment): applyPlacement seeds skill_state (source baseline) + mastery provenance"
```

---

## Task 5: Parent "Check-in results" panel + honest labeling

**Files:**
- Create: `src/app/(parent)/parent/learners/[id]/CheckpointResultsPanel.tsx`
- Modify: `src/app/(parent)/parent/learners/[id]/page.tsx` (render the panel)
- Modify: `src/app/(parent)/data.ts` (`SkillStatus.source`; expose pending checkpoints via `getLearnerDetail` or a sibling loader)
- Modify: `src/app/(parent)/actions.ts` (or the parent actions file) — `applyPlacementAction`, `redoCheckpointAction`
- Test: extend `src/app/(parent)/data.test.ts` if present (source surfaced); action tenancy test

**Interfaces:**
- Consumes: `getPendingCheckpointResults`, `applyPlacement`, `redoCheckpoint`, `isPlaced`.
- Produces: `applyPlacementAction(checkpointResultId)`, `redoCheckpointAction(checkpointResultId)` (server actions, `withAccount`-wrapped, `revalidatePath` the learner page); `SkillStatus.source?: "play" | "baseline"`.

- [ ] **Step 1: Surface `source` on `SkillStatus`.** In `data.ts`, add `source?: "play" | "baseline"` to `SkillStatus` and set it in `getLearnerDetail`'s `SKILLS.map(...)` using `isPlaced(state[skill.slug])` (import `isPlaced`; `source: isPlaced(rec) ? "baseline" : "play"`). Add the pending checkpoints to `LearnerDetail` (call `getPendingCheckpointResults(accountId, learnerId)` and add `checkpoints: PendingCheckpoint[]`).

- [ ] **Step 2: The server actions.** In the `(parent)` actions file (grep for the file holding `saveLearnerSettingsAction`; mirror its `withAccount` + `revalidatePath` shape):

```ts
export async function applyPlacementAction(checkpointResultId: string): Promise<{ ok: boolean }> {
  return withAccount(async (accountId) => {
    await applyPlacement(accountId, checkpointResultId);
    revalidatePath(`/parent/learners`);
    return { ok: true };
  }, { ok: false });
}
export async function redoCheckpointAction(checkpointResultId: string): Promise<{ ok: boolean }> {
  return withAccount(async (accountId) => {
    await redoCheckpoint(accountId, checkpointResultId);
    revalidatePath(`/parent/learners`);
    return { ok: true };
  }, { ok: false });
}
```

- [ ] **Step 3: The panel component.** `CheckpointResultsPanel.tsx` (client): given `checkpoints: PendingCheckpoint[]`, render one card per `pending` result — the strand/unit name, the per-skill verdicts (breezed → "She's got this"; mixed → "Practicing"; not_yet → "We'll teach it") as static-class pills, a summary (`seed.length` skills to skip), and **Apply — start her here** + **Not now / Redo** buttons calling the two actions (with a pending state). `applied` results render "Placed from check-in on <date>." Use existing `Pill`/`Button`/card primitives and static Tailwind class maps only. No child PII in any label.

- [ ] **Step 4: Render it in `page.tsx`.** Import `CheckpointResultsPanel`; render it near `RewardsPanel`, passing `detail.checkpoints`. In `SkillsByDomain`, when a skill's `source === "baseline"`, append a small "placed" marker to its pill (honest labeling) — a static class + text, no behavior change.

- [ ] **Step 5: Tests + gate.** Add a data/action test: `applyPlacementAction` for a non-owned learner is a no-op/`ok:false` (tenancy); `SkillStatus.source` is `"baseline"` after a placement. Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code` → clean. (This PR touches the parent frontend → the impeccable gate applies at ship.)

- [ ] **Step 6: Commit.**
```bash
git add "src/app/(parent)/"
git commit -m "feat(parent): Check-in results panel + placed-vs-mastered labeling"
```

---

## Task 6: COPPA export + delete wiring

**Files:**
- Modify: `src/lib/tutor/export.ts` (`LearnerExport.checkpointResults` + `ShapeInput`)
- Modify: `src/lib/tutor/store.ts` (`buildLearnerExport` reads `checkpoint_result`; `deleteLearner` already cascades via FK — assert it)
- Test: `src/lib/tutor/store.coppa.test.ts` (round-trip includes checkpoint_result; delete removes it)

**Interfaces:**
- Produces: `LearnerExport.checkpointResults: { unitId: string; phase: string; scores: Record<string, number>; status: string; createdAt: string }[]`.

- [ ] **Step 1: Extend the export type.** In `export.ts`, add to `LearnerExport` and `ShapeInput`:

```ts
  /** Baseline/mid/final check-in results (Phase C, spec §3.5) — per-skill
   *  first-try scores + the parent-confirmation status. */
  checkpointResults: { unitId: string; phase: string; scores: Record<string, number>; status: string; createdAt: string }[];
```

Wire it through the `shapeExport` function (map the input rows → the output shape) exactly like `skillState`.

- [ ] **Step 2: Read the rows in `buildLearnerExport`.** Add to the `Promise.all([...])` read block (near line 876):

```ts
    getDb().select().from(checkpointResult).where(eq(checkpointResult.learnerId, learnerId)).orderBy(desc(checkpointResult.createdAt)),
```

Destructure it (`checkpointResultRows`) and pass `checkpointResults: checkpointResultRows.map((r) => ({ unitId: r.unitId, phase: r.phase, scores: r.scores, status: r.status, createdAt: r.createdAt.toISOString() }))` into the shape input.

- [ ] **Step 3: COPPA test.** In `store.coppa.test.ts`, extend the round-trip: after a baseline attempt (or a direct `checkpointResult` insert), `buildLearnerExport` includes the row; after `deleteLearner`, a `select` on `checkpointResult` for that learner returns `[]` (FK cascade).

- [ ] **Step 4: Full gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code` → clean.

- [ ] **Step 5: Commit.**
```bash
git add src/lib/tutor/export.ts src/lib/tutor/store.ts src/lib/tutor/store.coppa.test.ts
git commit -m "feat(coppa): checkpoint_result in learner export + delete cascade"
```

---

## Task 7: The 3 authored baseline check-in units

**Files:**
- Modify: `src/content/programs/kaelyn-adaptive.ts` (add 3 `checkpoint:"baseline"` units)
- Test: `src/content/content.test.ts` (focused assertion on the 3 units)

**Interfaces:**
- Consumes: existing activity kinds + existing skill tags for Reading/Word/Math.

- [ ] **Step 1: Author the three units.** Add three units to `kaelyn-adaptive`, each `checkpoint: "baseline"`, world-themed to its strand, ~5–8 forgiving items ascending through that strand's skills, using ONLY existing kinds. Each activity's `skillTags` must be the REAL skill slugs the strand already uses (open the existing Reading/Word/Math units and copy the exact slugs; do NOT invent tags). Template (Math shown; mirror for Reading + Word with their kinds/skills):

```ts
{
  id: "math-baseline",
  order: 0, // surfaced first in the strand
  title: "Math — Show what you know",
  emoji: "🌟",
  world: "meadow", // reuse the strand's world token
  bigIdea: "Let's see what you already know — there's no wrong here.",
  phonicsFocus: "",
  mathFocus: "A quick, friendly check-in",
  project: "Just play — I'm watching what you've got.",
  checkpoint: "baseline",
  lessons: [
    {
      id: "math-baseline-l1",
      order: 1,
      title: "Show what you know",
      activities: [
        // one probe per skill, ascending; existing kinds only; forgiving.
        { id: "math-baseline-a1", kind: "math-tenframe", title: "...", band: "ready", skillTags: ["math.<real-slug>"], config: { /* valid config */ } },
        // ...5–8 items total, ascending difficulty across the strand's skills...
      ],
    },
  ],
},
```

**Correctness bar (hand-audited in review):** every `skillTags` slug exists in `SKILLS`; every `config` parses against its kind's schema; every activity id is unique across the WHOLE program; each unit carries `checkpoint:"baseline"`. Items ascend in difficulty so the first-try signal separates levels. Content is authored by Claude, **parent-reviewed before seeding**.

- [ ] **Step 2: Focused content test.** In `content.test.ts`:

```ts
it("has a baseline check-in unit per academic strand", () => {
  const program = PROGRAMS.find((p) => p.slug === "kaelyn-adaptive")!;
  const baselines = program.units.filter((u) => u.checkpoint === "baseline");
  expect(baselines.map((u) => u.id).sort()).toEqual(["math-baseline", "reading-baseline", "word-baseline"]);
  for (const u of baselines) {
    const acts = u.lessons.flatMap((l) => l.activities);
    expect(acts.length).toBeGreaterThanOrEqual(5);
    for (const a of acts) {
      expect(isActivityKindRegistered(a.kind)).toBe(true);
      for (const t of a.skillTags) expect(SKILLS.some((s) => s.slug === t)).toBe(true);
    }
  }
});
```

(The existing `content.test.ts` already asserts unique ids + registered kinds + resolvable tags program-wide, so the new units are covered by that walker too.)

- [ ] **Step 3: Full gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code` → clean.

- [ ] **Step 4: Commit.**
```bash
git add src/content/programs/kaelyn-adaptive.ts src/content/content.test.ts
git commit -m "feat(content): baseline check-in units for Reading, Word Study, Math"
```

---

## Task 8: E2E smoke + ship (incl. required prod re-seed)

**Files:**
- Create: `e2e/specs/baseline-placement.spec.ts`
- Modify: `playwright.config.ts` (register in the `public` project `testMatch`)

- [ ] **Step 1: E2E smoke.** Mirror `e2e/specs/science.spec.ts`. Assert a baseline check-in world renders on `/learn/kaelyn-adaptive` (e.g. "Math — Show what you know") and deep-link one baseline activity (a REAL id from Task 7, e.g. `math-baseline-a1`) to confirm it loads. Register `baseline-placement` in `playwright.config.ts`'s `public` `testMatch` alongside `science`. Verify discovery: `bunx playwright test --list | grep baseline` (do NOT run against prod).

- [ ] **Step 2: Full local gate.** Run: `bun run lint && bun run typecheck && bun run test && bun run build && bun run audit:dead-code` → clean.

- [ ] **Step 3: Commit.**
```bash
git add e2e/ playwright.config.ts
git commit -m "test(e2e): baseline check-in smoke"
```

- [ ] **Step 4: Ship.** Push the branch, open the PR. Run the merge-ready gate (`scripts/merge-ready.sh check --pr <n>` from the branch checkout): pipeline is simplifier + opus + codex + build + docs + knip + **impeccable** (this PR touches the parent frontend). The final whole-branch review (opus) + external adversarial review (codex) run first; fix any Critical/Important; attest at the final head. **USER-CONFIRMED merge** only. Migrations auto-run via the deploy migrate initContainer (the new `checkpoint_result` table).

- [ ] **Step 5: REQUIRED prod re-seed (the B1/B2 lesson).** Curriculum is DB-preferred → the 3 baseline units won't appear on prod until re-seeded. After the GitOps roll:
  - `export KUBECONFIG=~/.kube/config-k3s`
  - Build the local DB URL: the `kaelyns-academy-db-app` secret's `uri`, host → `127.0.0.1:55432`, drop sslmode.
  - `kubectl -n kaelyns-academy port-forward svc/kaelyns-academy-db-rw 55432:5432 &`
  - `DATABASE_URL=<local url> bun scripts/seed-content.ts` (idempotent upsert of `kaelyn-adaptive@v1`).
  - Verify: the prod DB has the 3 `checkpoint='baseline'` units under `kaelyn-adaptive` and their activities exist.

- [ ] **Step 6: Canary.** `/learn/kaelyn-adaptive` 200 with a baseline world present; `/api/health` 200; pod logs clean. Sign-in as the e2e parent (or inspect) to confirm the "Check-in results" panel renders once a baseline is completed. Confirm the `checkpoint_result` migration applied (health canary green / migration journal advanced).

---

## Self-Review Notes (applied)

- **Spec coverage:** §3 flow → Tasks 3–5; §4 data model → Task 1 (table + evidence source) + Task 6 (COPPA); §5 content → Task 7; §6 placement engine → Task 2; §7 parent surface → Task 5; §8 mastery change → Task 4; §9 testing → per-task tests + Task 8; §10 deploy + **required prod re-seed** → Task 8 Steps 5–6; §11 non-goals honored (baseline-only; no auto-apply; forward-only; no Science/Life Skills baseline; `reach_checkpoint` untouched).
- **Type consistency:** `checkpointResult`/`CheckpointResultRow`, `computePlacement`/`Placement`/`PlacementVerdict`, `nextSkillRecord(..., source?)`, `isPlaced`, `PendingCheckpoint`, `RecordAttemptInput.checkpointPhase`, `SkillStatus.source`, `LearnerExport.checkpointResults` are consistent across the tasks that produce/consume them.
- **Ordering:** schema (T1) → pure engine (T2) → capture (T3) → apply + mastery provenance (T4) → parent surface (T5) → COPPA (T6) → content (T7) → ship (T8). Each ends full-suite green; T2's engine is consumed by T3/T4 (knip note recorded).
- **Judgment calls implementers must not "fix":** baseline attempts fold ONLY into checkpoint_result (never skill_state) pre-confirm; forward-only placement; thresholds 0.8/0.5; `deriveOutcome` is source-aware (a baseline solid locks immediately; play still needs 2 distinct days), so placement seeds ONE `source:"baseline"` solid entry per skill; `source:"baseline"` provenance drives honest "placed" labeling; no auto-apply; checkpoint activities still earn activity stars.
