# Adventure 2.0 Phase A — Choice & Motivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the learner real agency and motivation: a star economy with a sticker book she spends into, a daily quest board she chooses from, a parent-gated interest picker that themes AI practice, and a branching world map.

**Architecture:** DB-first (spec §2): normalized, admin-authorable Postgres tables for the economy/quests/interests, with denormalized per-day quest snapshots so template edits never mutate an in-flight day. All child-state writes ride the existing account-scoped store conventions (`withOwnedLearner`, transactions with row locks, fail-closed jsonb parsing). Pure logic lives in dedicated modules tested without a DB (the codebase has **no live test DB** — pure functions + hand-rolled fake `tx` only, see `src/lib/tutor/store.test.ts`).

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Drizzle ORM (Postgres), Better Auth, Zod, Vitest, Tailwind v4 static class maps, Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-07-01-adventure-2-design.md` (approved). Read §3 (data model), §4 (learner UX), §13 (non-goals) before starting.

## Global Constraints

- Package manager is **bun** — never npm/yarn/pnpm. Verify: `bun run lint && bun run typecheck && bun run test && bun run build` before merge.
- **Build-safety:** never call `getDb()`/`getAuth()` at module top level. Lazy, per-request only.
- **Never disable a linter rule** (`eslint-disable`, `@ts-ignore`) — fix the root cause.
- **§8 child-data posture:** no free-text child input to AI; interests enter prompts as bounded preset labels only; no open-ended child↔LLM chat.
- **No dark patterns** (spec §13): no blind packs, no randomness in the shop, no streak pressure, no scarcity timers. Quests are penalty-free.
- Learner-surface server actions **never throw to the client** — return calm empty/`ok:false` results (pattern: `src/app/(learner)/actions.ts`).
- Admin actions run behind `withAdminAction` (pattern: `src/app/(admin)/admin/actions.ts`); parent actions behind `withAccount`.
- Icons: **Phosphor only** (never Lucide). Styling: static Tailwind class maps only.
- Guest mode: economy/quests/interests are **account-only**; guest learners keep today's experience unchanged (spec §3.7).
- COPPA: the export additions (Task 10) MUST ship in the same PR as the schema (Task 1). **Phase A ships as ONE PR** (`feature/adventure-2-phase-a`), one commit per task, through the merge-ready gate.
- New child-visible spoken strings use warm short copy; pronunciation overrides `[label](/IPA/)` only where a label mis-reads (see `docs/claude/` Kokoro notes).
- Vitest: no `Date.now()` coupling in pure logic — day strings are passed in as `YYYY-MM-DD` parameters.

---

### Task 1: Motivation schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (append after `deletionAudit`, before the `export *` line; also add `branchKey` to `unit`)
- Create: `src/lib/quests/config.ts`
- Test: `src/lib/quests/config.test.ts`
- Generated: `drizzle/0009_*.sql` (via `bun run db:generate`)

**Interfaces:**
- Consumes: existing `learner`, `unit` tables; `uuid()` helper in schema.ts.
- Produces: tables `starLedger`, `stickerPack`, `sticker`, `learnerSticker`, `interest`, `learnerInterest`, `questTemplate`, `learnerQuest`; column `unit.branchKey`; types/schemas `QuestKind`, `questKindSchema`, `QuestTarget`, `questTargetSchema`, `QuestProgress`, `questProgressSchema`, `QUEST_PARAMS_SCHEMAS`, `questParamsSchemaFor(kind)`. Every later task imports these names exactly.

- [ ] **Step 1: Write the failing test** — `src/lib/quests/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  QUEST_PARAMS_SCHEMAS,
  questKindSchema,
  questParamsSchemaFor,
  questProgressSchema,
  questTargetSchema,
} from "./config";

describe("quest config schemas", () => {
  it("accepts the three v1 kinds and rejects others", () => {
    expect(questKindSchema.safeParse("complete_n").success).toBe(true);
    expect(questKindSchema.safeParse("try_strand").success).toBe(true);
    expect(questKindSchema.safeParse("practice_skill").success).toBe(true);
    expect(questKindSchema.safeParse("reach_checkpoint").success).toBe(false); // Phase C
  });

  it("validates per-kind params", () => {
    expect(QUEST_PARAMS_SCHEMAS.complete_n.safeParse({ count: 3 }).success).toBe(true);
    expect(QUEST_PARAMS_SCHEMAS.complete_n.safeParse({ count: 0 }).success).toBe(false);
    expect(questParamsSchemaFor("try_strand").safeParse({}).success).toBe(true);
  });

  it("bounds target and progress", () => {
    expect(questTargetSchema.safeParse({ count: 3 }).success).toBe(true);
    expect(questTargetSchema.safeParse({ count: 3, unitId: "u1" }).success).toBe(true);
    expect(questTargetSchema.safeParse({ count: 99 }).success).toBe(false);
    expect(questProgressSchema.safeParse({ done: 0 }).success).toBe(true);
    expect(questProgressSchema.safeParse({ done: -1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun run test src/lib/quests/config.test.ts` → FAIL (module not found).

- [ ] **Step 3: Create `src/lib/quests/config.ts`:**

```ts
import { z } from "zod";

/**
 * Quest vocabulary (Adventure 2.0 Phase A). v1 kinds only — `reach_checkpoint`
 * arrives with Phase C (the kind column is plain text, so adding it later is
 * data, not a migration).
 */
export const questKindSchema = z.enum(["complete_n", "try_strand", "practice_skill"]);
export type QuestKind = z.infer<typeof questKindSchema>;

/** Per-kind template params, validated at authoring time (admin) AND before
 *  persistence (store) — same two-gate pattern as ACTIVITY_CONFIG_SCHEMAS. */
export const QUEST_PARAMS_SCHEMAS = {
  complete_n: z.object({ count: z.number().int().min(1).max(10) }),
  try_strand: z.object({}),
  practice_skill: z.object({}),
} as const satisfies Record<QuestKind, z.ZodTypeAny>;

export function questParamsSchemaFor(kind: QuestKind): z.ZodTypeAny {
  return QUEST_PARAMS_SCHEMAS[kind];
}

/**
 * The resolved, denormalized goal snapshotted onto a learner_quest at
 * assignment time (template edits never mutate an in-flight day):
 * every quest is "do `count` matching things"; the match predicate is the
 * kind + the optional unitId/skill target.
 */
export const questTargetSchema = z.object({
  count: z.number().int().min(1).max(10),
  unitId: z.string().min(1).optional(),
  skill: z.string().min(1).max(60).optional(),
});
export type QuestTarget = z.infer<typeof questTargetSchema>;

export const questProgressSchema = z.object({ done: z.number().int().min(0) });
export type QuestProgress = z.infer<typeof questProgressSchema>;

export type QuestStatus = "offered" | "active" | "done";
```

- [ ] **Step 4: Run to verify it passes** — `bun run test src/lib/quests/config.test.ts` → PASS.

- [ ] **Step 5: Append the tables to `src/lib/db/schema.ts`** (before `export * from "./auth-schema";`), and add `branchKey` to `unit`:

In the existing `unit` table, after the `checkpoint` column add:

```ts
  /** Adventure 2.0 branching: consecutive units sharing a non-null branchKey
   *  render as parallel map paths (spec §3.6). Null = the single main path. */
  branchKey: text("branch_key"),
```

Append at the bottom:

```ts
// ── Adventure 2.0 Phase A: motivation + choice (spec §3) ─────────────────────

import type { QuestProgress, QuestTarget } from "@/lib/quests/config";

/**
 * Append-only star economy (spec §3.1). Balance = sum(delta); no mutable
 * counter to corrupt. Earns are written inside recordAttempt's transaction;
 * spends inside purchaseSticker's transaction (atomic with the grant).
 */
export const starLedger = pgTable(
  "star_ledger",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    /** activity_complete | quest_complete | sticker_purchase | adjustment */
    reason: text("reason").notNull(),
    /** Polymorphic reference (activityId / learnerQuest.id / sticker.id). */
    refId: text("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("star_ledger_learner_created_idx").on(t.learnerId, t.createdAt)],
);

export const stickerPack = pgTable("sticker_pack", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  theme: text("theme"),
  /** draft | published | archived (status lifecycle, NOT version-cloned — spec §2). */
  status: text("status").notNull().default("draft"),
  sortKey: text("sort_key").notNull().default("a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sticker = pgTable(
  "sticker",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    packId: text("pack_id")
      .notNull()
      .references(() => stickerPack.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** v1 format "emoji:🦄" (rendered as a big emoji tile); future "asset:/stickers/…". */
    artRef: text("art_ref").notNull(),
    starCost: integer("star_cost").notNull(),
    sortKey: text("sort_key").notNull().default("a"),
  },
  (t) => [uniqueIndex("sticker_pack_slug_uq").on(t.packId, t.slug)],
);

export const learnerSticker = pgTable(
  "learner_sticker",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    stickerId: text("sticker_id")
      .notNull()
      .references(() => sticker.id, { onDelete: "cascade" }),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learner_sticker_uq").on(t.learnerId, t.stickerId)],
);

/** Admin-authored preset interest taxonomy (spec §3.3). Bounded vocabulary —
 *  the ONLY interest strings that can ever reach an AI prompt (§8). */
export const interest = pgTable("interest", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  /** A single emoji. */
  icon: text("icon"),
  status: text("status").notNull().default("published"),
});

/**
 * Two row kinds per (learner, interest): source="parent" = the parent OFFERS
 * this chip to the picker; source="child" = the child PICKED it. Child picks
 * are validated ⊆ the offered set (spec §4.3).
 */
export const learnerInterest = pgTable(
  "learner_interest",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    interestId: text("interest_id")
      .notNull()
      .references(() => interest.id, { onDelete: "cascade" }),
    /** parent (offered) | child (picked) */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learner_interest_uq").on(t.learnerId, t.interestId, t.source)],
);

export const questTemplate = pgTable("quest_template", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  /** May contain the "{focus}" placeholder, resolved at assignment (unit/skill name). */
  title: text("title").notNull(),
  /** complete_n | try_strand | practice_skill (v1; Phase C adds reach_checkpoint). */
  kind: text("kind").notNull(),
  params: jsonb("params").$type<unknown>().notNull().default({}),
  rewardStars: integer("reward_stars").notNull().default(3),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One offered/active/done quest for one learner on one day (spec §3.4).
 * kind/title/target/rewardStars are DENORMALIZED from the template at
 * assignment so a template edit never mutates an in-flight day (same
 * philosophy as enrollment version-pinning).
 */
export const learnerQuest = pgTable(
  "learner_quest",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    learnerId: text("learner_id")
      .notNull()
      .references(() => learner.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => questTemplate.id, { onDelete: "cascade" }),
    programSlug: text("program_slug").notNull(),
    /** Calendar day (YYYY-MM-DD, server clock) the quest belongs to. */
    assignedOn: date("assigned_on").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    target: jsonb("target").$type<QuestTarget>().notNull(),
    progress: jsonb("progress").$type<QuestProgress>().notNull(),
    rewardStars: integer("reward_stars").notNull(),
    /** offered | active | done. Yesterday's rows simply aren't today's (no "expired"). */
    status: text("status").notNull().default("offered"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("learner_quest_learner_day_idx").on(t.learnerId, t.assignedOn),
    // Idempotent daily generation: two racing requests insert the same drafts
    // with onConflictDoNothing keyed here, then re-read.
    uniqueIndex("learner_quest_day_template_uq").on(
      t.learnerId,
      t.programSlug,
      t.assignedOn,
      t.templateId,
    ),
  ],
);
```

NOTE: schema.ts currently imports types with `import type { EnrollmentConfig, LearnerSettings } from "@/lib/content/config";` at the top — move the new `import type { QuestProgress, QuestTarget } from "@/lib/quests/config";` up to join the other imports (imports must stay at the top of the file; the snippet above shows it inline only for reading order).

- [ ] **Step 6: Generate the migration** — `bun run db:generate`. Expected: a new `drizzle/0009_*.sql` creating 8 tables + `ALTER TABLE "unit" ADD COLUMN "branch_key" text;`. Inspect the SQL for exactly those statements.

- [ ] **Step 7: Verify** — `bun run typecheck && bun run lint && bun run test` → all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/lib/quests/ drizzle/
git commit -m "feat(schema): Adventure 2.0 Phase A tables — star ledger, stickers, interests, quests, unit.branch_key"
```

---

### Task 2: Rewards store — balance, ledger, earn-on-attempt

**Files:**
- Create: `src/lib/rewards/store.ts`, `src/lib/rewards/logic.ts`
- Modify: `src/lib/tutor/store.ts` (`recordAttempt` transaction)
- Test: `src/lib/rewards/logic.test.ts`, extend `src/lib/tutor/store.test.ts`

**Interfaces:**
- Consumes: `starLedger`, `learner` tables; `withOwnedLearner` from `@/lib/tutor/scope`; the fake-`tx` test harness in `store.test.ts`.
- Produces:
  - `logic.ts`: `sumLedger(deltas: number[]): number`, `earnedStarsForAttempt(input: { generated: boolean; stars: number; alreadyCompleted: boolean }): number`
  - `store.ts`: `getStarBalance(accountId, learnerId): Promise<number>`, `listStarLedger(accountId, learnerId, limit?): Promise<LedgerEntry[]>` with `interface LedgerEntry { delta: number; reason: string; refId: string | null; createdAt: string }`, `grantBonusStars(accountId, learnerId, amount: number): Promise<boolean>`
  - `recordAttempt` writes an `activity_complete` ledger row per the v1 economy rule.

**v1 economy rule** (keeps the ledger grind-proof; quests are the repeatable earner):
an attempt earns `score.stars` ledger stars ONLY when it is authored (`generated=false`) AND it is the learner's FIRST completion of that `activityId`. Repeats and AI practice earn quest progress, not ledger stars.

- [ ] **Step 1: Write the failing pure-logic test** — `src/lib/rewards/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { earnedStarsForAttempt, sumLedger } from "./logic";

describe("sumLedger", () => {
  it("sums deltas and treats empty as zero", () => {
    expect(sumLedger([])).toBe(0);
    expect(sumLedger([3, 2, -4])).toBe(1);
  });
});

describe("earnedStarsForAttempt (v1 economy rule)", () => {
  it("credits stars for a first authored completion", () => {
    expect(earnedStarsForAttempt({ generated: false, stars: 3, alreadyCompleted: false })).toBe(3);
  });
  it("credits nothing for repeats, generated practice, or zero-star attempts", () => {
    expect(earnedStarsForAttempt({ generated: false, stars: 3, alreadyCompleted: true })).toBe(0);
    expect(earnedStarsForAttempt({ generated: true, stars: 3, alreadyCompleted: false })).toBe(0);
    expect(earnedStarsForAttempt({ generated: false, stars: 0, alreadyCompleted: false })).toBe(0);
  });
});
```

- [ ] **Step 2: Run** — `bun run test src/lib/rewards/logic.test.ts` → FAIL.

- [ ] **Step 3: Create `src/lib/rewards/logic.ts`:**

```ts
/** Pure star-economy rules (unit-tested; no DB). */

export function sumLedger(deltas: number[]): number {
  return deltas.reduce((n, d) => n + d, 0);
}

/**
 * v1 economy rule: ledger stars are earned ONLY on the FIRST completion of an
 * AUTHORED activity (grind-proof by construction; quests + checkpoints are the
 * repeatable earners). Returns the delta to credit (0 = write nothing).
 */
export function earnedStarsForAttempt(input: {
  generated: boolean;
  stars: number;
  alreadyCompleted: boolean;
}): number {
  if (input.generated || input.alreadyCompleted) return 0;
  return Math.max(0, Math.min(3, Math.trunc(input.stars)));
}
```

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Create `src/lib/rewards/store.ts`:**

```ts
// server-only: opens DB connections; import from server actions / route handlers only.
import { and, desc, eq, sum } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { learner, starLedger } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";

export interface LedgerEntry {
  delta: number;
  reason: string;
  refId: string | null;
  createdAt: string;
}

/** Current balance = sum(delta) over the learner's ledger (account-scoped). */
export async function getStarBalance(accountId: string, learnerId: string): Promise<number> {
  return withOwnedLearner<number>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ total: sum(starLedger.delta) })
        .from(starLedger)
        .where(eq(starLedger.learnerId, learnerId));
      return Number(rows[0]?.total ?? 0);
    },
    0,
  );
}

/** Newest-first ledger page for the parent Rewards panel. */
export async function listStarLedger(
  accountId: string,
  learnerId: string,
  limit = 50,
): Promise<LedgerEntry[]> {
  return withOwnedLearner<LedgerEntry[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select()
        .from(starLedger)
        .where(eq(starLedger.learnerId, learnerId))
        .orderBy(desc(starLedger.createdAt))
        .limit(Math.max(1, Math.min(200, limit)));
      return rows.map((r) => ({
        delta: r.delta,
        reason: r.reason,
        refId: r.refId,
        createdAt: r.createdAt.toISOString(),
      }));
    },
    [],
  );
}

/** Parent "offline win" bonus (spec §5): a bounded manual adjustment. */
export async function grantBonusStars(
  accountId: string,
  learnerId: string,
  amount: number,
): Promise<boolean> {
  const bounded = Math.trunc(amount);
  if (bounded < 1 || bounded > 20) return false;
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      await getDb()
        .insert(starLedger)
        .values({ learnerId, delta: bounded, reason: "adjustment", refId: null });
      return true;
    },
    false,
  );
}
```

(`withOwnedLearner` is exported from `src/lib/tutor/scope.ts` — check its exact export list first; if it is not exported there, re-export it the way `store.ts` re-exports `getLearner`.)

- [ ] **Step 6: Wire the earn into `recordAttempt`** in `src/lib/tutor/store.ts`. Add `starLedger` to the schema import line. Inside the transaction, AFTER the `tx.insert(attempt)` block and BEFORE the skill-evidence loop, insert:

```ts
    // Star economy (Adventure 2.0): first authored completion earns score.stars
    // into the append-only ledger, inside this same transaction (all-or-nothing
    // with the attempt). Repeats/generated earn 0 (v1 grind-proof rule).
    const prior = await tx
      .select({ id: attempt.id })
      .from(attempt)
      .where(
        and(
          eq(attempt.learnerId, input.learnerId),
          eq(attempt.activityId, input.activityId),
          eq(attempt.generated, false),
        ),
      )
      .limit(2); // the row we just inserted + any earlier one
    const earned = earnedStarsForAttempt({
      generated,
      stars: input.score.stars,
      alreadyCompleted: prior.length > 1,
    });
    if (earned > 0) {
      await tx.insert(starLedger).values({
        learnerId: input.learnerId,
        delta: earned,
        reason: "activity_complete",
        refId: input.activityId,
      });
    }
```

Add `import { earnedStarsForAttempt } from "@/lib/rewards/logic";` at the top.

- [ ] **Step 7: Extend `src/lib/tutor/store.test.ts`** with the fake-`tx` pattern already in the file (canned rows per table). Add a canned `attemptRows` selector (the fake `then()` switch) returning one row (only the just-inserted attempt → first completion) and record `star_ledger` inserts. Tests:

```ts
it("credits the ledger inside the tx on a first authored completion", async () => {
  await recordAttempt("A1", baseInput({ score: score(3) }));
  expect(ledgerInserts).toEqual([
    expect.objectContaining({ delta: 3, reason: "activity_complete", refId: baseInput().activityId }),
  ]);
});

it("writes no ledger row for generated practice", async () => {
  await recordAttempt("A1", baseInput({ generated: true }));
  expect(ledgerInserts).toHaveLength(0);
});

it("writes no ledger row on a repeat completion", async () => {
  attemptRows.value = [{ id: "prev" }, { id: "new" }]; // prior authored attempt exists
  await recordAttempt("A1", baseInput({ score: score(3) }));
  expect(ledgerInserts).toHaveLength(0);
});
```

Adapt helper names (`baseInput`, `score`) to whatever the existing file uses — extend, don't restructure, the existing harness (add `ledgerInserts: Record<string, unknown>[]` mirroring `attemptInserts`, reset it in `beforeEach`).

- [ ] **Step 8: Run** — `bun run test src/lib/tutor/store.test.ts src/lib/rewards/logic.test.ts` → PASS. Then `bun run typecheck`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/rewards/ src/lib/tutor/store.ts src/lib/tutor/store.test.ts
git commit -m "feat(rewards): star ledger store + first-completion earn inside recordAttempt tx"
```

---

### Task 3: Sticker catalog + atomic purchase

**Files:**
- Create: `src/lib/rewards/stickers.ts`
- Test: `src/lib/rewards/stickers.test.ts` (fake-`tx` pattern)

**Interfaces:**
- Consumes: `stickerPack`, `sticker`, `learnerSticker`, `starLedger`, `learner` tables; `sumLedger` from `./logic`.
- Produces:
  - `interface CatalogSticker { id: string; slug: string; title: string; artRef: string; starCost: number }`
  - `interface CatalogPack { id: string; slug: string; title: string; theme: string | null; stickers: CatalogSticker[] }`
  - `getStickerCatalog(): Promise<CatalogPack[]>` — published packs only, sorted by sortKey.
  - `listOwnedStickerIds(accountId, learnerId): Promise<string[]>`
  - `type PurchaseResult = { ok: true } | { ok: false; reason: "not_found" | "already_owned" | "insufficient" | "error" }`
  - `purchaseSticker(accountId, learnerId, stickerId): Promise<PurchaseResult>`

- [ ] **Step 1: Write the failing test.** Build a fake `tx` (copy the builder pattern from `store.test.ts`, tables: `learner`, `sticker` joined with `sticker_pack`, `learner_sticker`, `star_ledger`). Cases:

```ts
it("purchases atomically: lock, balance check, spend + grant in one tx", async () => {
  stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
  ledgerRows.value = [{ delta: 8 }];
  const result = await purchaseSticker("A1", "L1", "S1");
  expect(result).toEqual({ ok: true });
  expect(ops).toContainEqual({ op: "select.for", table: "learner" }); // row lock first
  expect(ledgerInserts).toEqual([
    expect.objectContaining({ delta: -5, reason: "sticker_purchase", refId: "S1" }),
  ]);
  expect(ownedInserts).toHaveLength(1);
});

it("rejects when balance is insufficient (nothing written)", async () => {
  stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
  ledgerRows.value = [{ delta: 3 }];
  expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "insufficient" });
  expect(ledgerInserts).toHaveLength(0);
});

it("rejects an unpublished pack's sticker as not_found", async () => {
  stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "draft" }];
  expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "not_found" });
});

it("rejects a duplicate as already_owned", async () => {
  stickerRows.value = [{ id: "S1", starCost: 5, packStatus: "published" }];
  ownedRows.value = [{ id: "existing" }];
  ledgerRows.value = [{ delta: 8 }];
  expect(await purchaseSticker("A1", "L1", "S1")).toEqual({ ok: false, reason: "already_owned" });
});
```

- [ ] **Step 2: Run** — FAIL (module not found).

- [ ] **Step 3: Create `src/lib/rewards/stickers.ts`:**

```ts
// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { learner, learnerSticker, sticker, stickerPack, starLedger } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";
import { sumLedger } from "./logic";

export interface CatalogSticker {
  id: string;
  slug: string;
  title: string;
  artRef: string;
  starCost: number;
}

export interface CatalogPack {
  id: string;
  slug: string;
  title: string;
  theme: string | null;
  stickers: CatalogSticker[];
}

/** Published packs + their stickers (the child-facing catalog). Global, not
 *  account-scoped — same posture as the program catalog. */
export async function getStickerCatalog(): Promise<CatalogPack[]> {
  const rows = await getDb()
    .select({
      packId: stickerPack.id,
      packSlug: stickerPack.slug,
      packTitle: stickerPack.title,
      theme: stickerPack.theme,
      packSort: stickerPack.sortKey,
      id: sticker.id,
      slug: sticker.slug,
      title: sticker.title,
      artRef: sticker.artRef,
      starCost: sticker.starCost,
      sort: sticker.sortKey,
    })
    .from(stickerPack)
    .innerJoin(sticker, eq(sticker.packId, stickerPack.id))
    .where(eq(stickerPack.status, "published"))
    .orderBy(asc(stickerPack.sortKey), asc(sticker.sortKey));

  const packs = new Map<string, CatalogPack>();
  for (const r of rows) {
    let pack = packs.get(r.packId);
    if (!pack) {
      pack = { id: r.packId, slug: r.packSlug, title: r.packTitle, theme: r.theme, stickers: [] };
      packs.set(r.packId, pack);
    }
    pack.stickers.push({ id: r.id, slug: r.slug, title: r.title, artRef: r.artRef, starCost: r.starCost });
  }
  return [...packs.values()];
}

export async function listOwnedStickerIds(accountId: string, learnerId: string): Promise<string[]> {
  return withOwnedLearner<string[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({ stickerId: learnerSticker.stickerId })
        .from(learnerSticker)
        .where(eq(learnerSticker.learnerId, learnerId));
      return rows.map((r) => r.stickerId);
    },
    [],
  );
}

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "already_owned" | "insufficient" | "error" };

/**
 * Atomic spend+grant (spec §3.1): one transaction that (1) locks the learner
 * row FOR UPDATE — the ownership check AND the serialization point, so two
 * concurrent purchases for the same learner can't both pass the balance check —
 * then (2) validates the sticker is purchasable, (3) sums the ledger, and
 * (4) writes the spend + the grant together. Balance can never go negative.
 */
export async function purchaseSticker(
  accountId: string,
  learnerId: string,
  stickerId: string,
): Promise<PurchaseResult> {
  return getDb().transaction(async (tx) => {
    const owned = await tx
      .select({ id: learner.id })
      .from(learner)
      .where(and(eq(learner.id, learnerId), eq(learner.accountId, accountId)))
      .limit(1)
      .for("update");
    if (!owned[0]) return { ok: false, reason: "not_found" as const };

    const stickerRows = await tx
      .select({ id: sticker.id, starCost: sticker.starCost, packStatus: stickerPack.status })
      .from(sticker)
      .innerJoin(stickerPack, eq(sticker.packId, stickerPack.id))
      .where(eq(sticker.id, stickerId))
      .limit(1);
    const target = stickerRows[0];
    if (!target || target.packStatus !== "published") {
      return { ok: false, reason: "not_found" as const };
    }

    const already = await tx
      .select({ id: learnerSticker.id })
      .from(learnerSticker)
      .where(and(eq(learnerSticker.learnerId, learnerId), eq(learnerSticker.stickerId, stickerId)))
      .limit(1);
    if (already[0]) return { ok: false, reason: "already_owned" as const };

    const ledgerRows = await tx
      .select({ delta: starLedger.delta })
      .from(starLedger)
      .where(eq(starLedger.learnerId, learnerId));
    const balance = sumLedger(ledgerRows.map((r) => r.delta));
    if (balance < target.starCost) return { ok: false, reason: "insufficient" as const };

    await tx.insert(starLedger).values({
      learnerId,
      delta: -target.starCost,
      reason: "sticker_purchase",
      refId: stickerId,
    });
    await tx.insert(learnerSticker).values({ learnerId, stickerId });
    return { ok: true as const };
  });
}
```

- [ ] **Step 4: Run** — `bun run test src/lib/rewards/stickers.test.ts` → PASS; `bun run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rewards/stickers.ts src/lib/rewards/stickers.test.ts
git commit -m "feat(rewards): published sticker catalog + atomic star purchase"
```

---

### Task 4: Quest logic — selection + progress fold (pure)

**Files:**
- Create: `src/lib/quests/logic.ts`
- Test: `src/lib/quests/logic.test.ts`

**Interfaces:**
- Consumes: `QuestKind`, `QuestTarget`, `QuestProgress`, `QUEST_PARAMS_SCHEMAS` from `./config`; `Recommendation` type from `@/lib/tutor/recommend`; `Program` from `@/content`.
- Produces (used by Task 5's store and Task 2's `recordAttempt` extension):
  - `interface QuestAttemptCtx { activityId: string; unitId: string | null; skills: string[]; generated: boolean }`
  - `attemptMatchesQuest(kind: QuestKind, target: QuestTarget, ctx: QuestAttemptCtx): boolean`
  - `foldQuestProgress(quest: { kind: QuestKind; target: QuestTarget; progress: QuestProgress }, ctx: QuestAttemptCtx): { progress: QuestProgress; completed: boolean }`
  - `interface QuestDraft { templateId: string; kind: QuestKind; title: string; target: QuestTarget; rewardStars: number }`
  - `interface QuestTemplateRow { id: string; slug: string; title: string; kind: QuestKind; params: unknown; rewardStars: number }`
  - `selectDailyQuests(templates: QuestTemplateRow[], recs: RecommendationLite[], emergingSkills: string[]): QuestDraft[]` where `interface RecommendationLite { unitId: string; unitTitle: string }`
  - `findUnitIdOfActivity(program: Program, activityId: string): string | null`

- [ ] **Step 1: Write the failing test** — `src/lib/quests/logic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  attemptMatchesQuest,
  findUnitIdOfActivity,
  foldQuestProgress,
  selectDailyQuests,
  type QuestAttemptCtx,
} from "./logic";

const ctx = (over: Partial<QuestAttemptCtx> = {}): QuestAttemptCtx => ({
  activityId: "act-1",
  unitId: "unit-1",
  skills: ["math.count"],
  generated: false,
  ...over,
});

describe("attemptMatchesQuest", () => {
  it("complete_n matches any authored attempt (generated too — practice counts toward quests)", () => {
    expect(attemptMatchesQuest("complete_n", { count: 3 }, ctx())).toBe(true);
    expect(attemptMatchesQuest("complete_n", { count: 3 }, ctx({ generated: true }))).toBe(true);
  });
  it("try_strand matches only the target unit", () => {
    expect(attemptMatchesQuest("try_strand", { count: 1, unitId: "unit-1" }, ctx())).toBe(true);
    expect(attemptMatchesQuest("try_strand", { count: 1, unitId: "unit-9" }, ctx())).toBe(false);
    expect(attemptMatchesQuest("try_strand", { count: 1, unitId: "unit-1" }, ctx({ unitId: null }))).toBe(false);
  });
  it("practice_skill matches when the attempt exercises the target skill", () => {
    expect(attemptMatchesQuest("practice_skill", { count: 2, skill: "math.count" }, ctx())).toBe(true);
    expect(attemptMatchesQuest("practice_skill", { count: 2, skill: "phonics.cvc" }, ctx())).toBe(false);
  });
});

describe("foldQuestProgress", () => {
  it("increments and completes at count", () => {
    const q = { kind: "complete_n" as const, target: { count: 2 }, progress: { done: 1 } };
    expect(foldQuestProgress(q, ctx())).toEqual({ progress: { done: 2 }, completed: true });
  });
  it("does not increment on a non-match and never exceeds count", () => {
    const miss = { kind: "try_strand" as const, target: { count: 1, unitId: "u9" }, progress: { done: 0 } };
    expect(foldQuestProgress(miss, ctx())).toEqual({ progress: { done: 0 }, completed: false });
    const capped = { kind: "complete_n" as const, target: { count: 2 }, progress: { done: 2 } };
    expect(foldQuestProgress(capped, ctx()).progress.done).toBe(2);
  });
});

describe("selectDailyQuests", () => {
  const templates = [
    { id: "t1", slug: "do-three", title: "Do 3 activities", kind: "complete_n" as const, params: { count: 3 }, rewardStars: 3 },
    { id: "t2", slug: "explore", title: "Explore {focus}", kind: "try_strand" as const, params: {}, rewardStars: 2 },
    { id: "t3", slug: "level-up", title: "Level up {focus}", kind: "practice_skill" as const, params: {}, rewardStars: 2 },
  ];
  it("offers up to 3 quests with resolved targets and titles", () => {
    const drafts = selectDailyQuests(
      templates,
      [{ unitId: "u-read", unitTitle: "Reading River" }],
      ["math.count"],
    );
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toEqual({
      templateId: "t1", kind: "complete_n", title: "Do 3 activities",
      target: { count: 3 }, rewardStars: 3,
    });
    expect(drafts[1]).toEqual({
      templateId: "t2", kind: "try_strand", title: "Explore Reading River",
      target: { count: 1, unitId: "u-read" }, rewardStars: 2,
    });
    expect(drafts[2].target).toEqual({ count: 2, skill: "math.count" });
  });
  it("skips kinds whose inputs are missing (no recs → no try_strand; no emerging → no practice_skill)", () => {
    const drafts = selectDailyQuests(templates, [], []);
    expect(drafts.map((d) => d.kind)).toEqual(["complete_n"]);
  });
  it("skips a template whose params fail its kind schema", () => {
    const bad = [{ ...templates[0], params: { count: 0 } }];
    expect(selectDailyQuests(bad, [], [])).toHaveLength(0);
  });
});

describe("findUnitIdOfActivity", () => {
  it("walks the tree and returns the containing unit id", () => {
    const program = {
      slug: "p", title: "", subtitle: "", ageBand: "", summary: "",
      units: [{
        id: "u1", order: 1, title: "", emoji: "", world: "sunshine", bigIdea: "",
        phonicsFocus: "", mathFocus: "", project: "",
        lessons: [{ id: "l1", order: 1, title: "", activities: [{ id: "a1" }] }],
      }],
    } as never;
    expect(findUnitIdOfActivity(program, "a1")).toBe("u1");
    expect(findUnitIdOfActivity(program, "zz")).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Create `src/lib/quests/logic.ts`:**

```ts
import type { Program } from "@/content";
import {
  QUEST_PARAMS_SCHEMAS,
  type QuestKind,
  type QuestProgress,
  type QuestTarget,
} from "./config";

/** The attempt facts the quest fold matches against (derived server-side). */
export interface QuestAttemptCtx {
  activityId: string;
  unitId: string | null;
  skills: string[];
  generated: boolean;
}

export function attemptMatchesQuest(
  kind: QuestKind,
  target: QuestTarget,
  ctx: QuestAttemptCtx,
): boolean {
  switch (kind) {
    case "complete_n":
      // Any completed activity counts — INCLUDING generated practice, so "more,
      // made just for me" moves the day's quest (repeat play earns quest
      // progress even though the ledger's first-completion rule earns nothing).
      return true;
    case "try_strand":
      return ctx.unitId !== null && ctx.unitId === target.unitId;
    case "practice_skill":
      return target.skill !== undefined && ctx.skills.includes(target.skill);
  }
}

export function foldQuestProgress(
  quest: { kind: QuestKind; target: QuestTarget; progress: QuestProgress },
  ctx: QuestAttemptCtx,
): { progress: QuestProgress; completed: boolean } {
  if (!attemptMatchesQuest(quest.kind, quest.target, ctx)) {
    return { progress: quest.progress, completed: false };
  }
  const done = Math.min(quest.target.count, quest.progress.done + 1);
  return { progress: { done }, completed: done >= quest.target.count };
}

export interface QuestTemplateRow {
  id: string;
  slug: string;
  title: string;
  kind: QuestKind;
  params: unknown;
  rewardStars: number;
}

export interface RecommendationLite {
  unitId: string;
  unitTitle: string;
}

export interface QuestDraft {
  templateId: string;
  kind: QuestKind;
  title: string;
  target: QuestTarget;
  rewardStars: number;
}

const MAX_DAILY_QUESTS = 3;

/**
 * Pure daily-menu selection: one draft per kind, at most 3 (spec §3.4).
 *   complete_n     → params.count, no target refinement
 *   try_strand     → the recommender's TOP strand (breadth-first, so it points
 *                    at her least-played strand); count 1
 *   practice_skill → the first emerging skill; count 2
 * A template whose params fail the kind schema is skipped (bad authoring must
 * not break the child's day). Deterministic — no randomness (spec §13).
 */
export function selectDailyQuests(
  templates: QuestTemplateRow[],
  recs: RecommendationLite[],
  emergingSkills: string[],
): QuestDraft[] {
  const drafts: QuestDraft[] = [];
  const seenKinds = new Set<QuestKind>();
  for (const t of templates) {
    if (drafts.length >= MAX_DAILY_QUESTS || seenKinds.has(t.kind)) continue;
    const params = QUEST_PARAMS_SCHEMAS[t.kind]?.safeParse(t.params);
    if (!params?.success) continue;

    if (t.kind === "complete_n") {
      const count = (params.data as { count: number }).count;
      drafts.push({ templateId: t.id, kind: t.kind, title: t.title, target: { count }, rewardStars: t.rewardStars });
    } else if (t.kind === "try_strand") {
      const rec = recs[0];
      if (!rec) continue;
      drafts.push({
        templateId: t.id,
        kind: t.kind,
        title: t.title.replace("{focus}", rec.unitTitle),
        target: { count: 1, unitId: rec.unitId },
        rewardStars: t.rewardStars,
      });
    } else {
      const skill = emergingSkills[0];
      if (!skill) continue;
      drafts.push({
        templateId: t.id,
        kind: t.kind,
        title: t.title.replace("{focus}", skill),
        target: { count: 2, skill },
        rewardStars: t.rewardStars,
      });
    }
    seenKinds.add(t.kind);
  }
  return drafts;
}

/** Walk a program tree to the unit containing `activityId` (quest fold context). */
export function findUnitIdOfActivity(program: Program, activityId: string): string | null {
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      if (lesson.activities.some((a) => a.id === activityId)) return unit.id;
    }
  }
  return null;
}
```

Note the `practice_skill` title uses the raw skill slug in `{focus}` — Task 5's store resolves a friendly label via the `skill` table before persisting; the pure layer stays DB-free.

- [ ] **Step 4: Run** — PASS. `bun run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quests/logic.ts src/lib/quests/logic.test.ts
git commit -m "feat(quests): pure daily-menu selection + attempt-fold logic"
```

---

### Task 5: Quest store — daily assignment, activation, attempt fold

**Files:**
- Create: `src/lib/quests/store.ts`
- Modify: `src/lib/tutor/store.ts` (`recordAttempt`: quest fold + reward credit), `src/app/(learner)/actions.ts` (derive `QuestAttemptCtx`)
- Test: extend `src/lib/tutor/store.test.ts` (fold + reward inside tx)

**Interfaces:**
- Consumes: `learnerQuest`, `questTemplate`, `skill`, `starLedger` tables; `foldQuestProgress`, `findUnitIdOfActivity`, `QuestDraft`, `QuestAttemptCtx` from `./logic`; `questKindSchema`, `questTargetSchema`, `questProgressSchema` from `./config`; `resolveLearnerProgram` from `@/lib/content/repository`.
- Produces:
  - `interface QuestView { id: string; title: string; kind: QuestKind; target: QuestTarget; progress: QuestProgress; rewardStars: number; status: QuestStatus }`
  - `listPublishedQuestTemplates(): Promise<QuestTemplateRow[]>`
  - `getDailyQuests(accountId, learnerId, programSlug, day): Promise<QuestView[]>`
  - `assignDailyQuests(accountId, learnerId, programSlug, day, drafts: QuestDraft[]): Promise<QuestView[]>` — idempotent (`onConflictDoNothing` on the day+template unique index, then re-read).
  - `activateQuest(accountId, learnerId, questId, day): Promise<boolean>` — sets target `offered→active` and demotes any other same-day `active→offered` (one active at a time, spec §3.4).
  - `applyAttemptToQuests(tx, learnerId, day, ctx: QuestAttemptCtx): Promise<void>` — exported for `recordAttempt`; takes the OPEN transaction.

- [ ] **Step 1: Write the failing tests** in `src/lib/tutor/store.test.ts` — extend the fake `tx` with `learner_quest` canned rows + captured updates:

```ts
it("folds an active quest and credits its reward inside the attempt tx", async () => {
  questRows.value = [{
    id: "Q1", kind: "complete_n", target: { count: 1 }, progress: { done: 0 },
    rewardStars: 2, status: "active",
  }];
  await recordAttempt("A1", baseInput());
  expect(questUpdates).toContainEqual(
    expect.objectContaining({ status: "done", progress: { done: 1 } }),
  );
  expect(ledgerInserts).toContainEqual(
    expect.objectContaining({ delta: 2, reason: "quest_complete", refId: "Q1" }),
  );
});

it("leaves offered quests untouched", async () => {
  questRows.value = [{
    id: "Q1", kind: "complete_n", target: { count: 1 }, progress: { done: 0 },
    rewardStars: 2, status: "offered",
  }];
  await recordAttempt("A1", baseInput());
  expect(questUpdates).toHaveLength(0);
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Create `src/lib/quests/store.ts`:**

```ts
// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { learnerQuest, questTemplate, skill, starLedger } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";
import { parseJsonbFailClosed } from "@/lib/tutor/jsonb";
import {
  questKindSchema,
  questProgressSchema,
  questTargetSchema,
  type QuestKind,
  type QuestProgress,
  type QuestStatus,
  type QuestTarget,
} from "./config";
import { foldQuestProgress, type QuestAttemptCtx, type QuestDraft, type QuestTemplateRow } from "./logic";

export interface QuestView {
  id: string;
  title: string;
  kind: QuestKind;
  target: QuestTarget;
  progress: QuestProgress;
  rewardStars: number;
  status: QuestStatus;
}

/** Published templates in authoring sort order (selection input). */
export async function listPublishedQuestTemplates(): Promise<QuestTemplateRow[]> {
  const rows = await getDb()
    .select()
    .from(questTemplate)
    .where(eq(questTemplate.status, "published"))
    .orderBy(asc(questTemplate.createdAt));
  const out: QuestTemplateRow[] = [];
  for (const r of rows) {
    const kind = questKindSchema.safeParse(r.kind);
    if (!kind.success) continue; // unknown kind (e.g. Phase C data on old code) — skip
    out.push({ id: r.id, slug: r.slug, title: r.title, kind: kind.data, params: r.params, rewardStars: r.rewardStars });
  }
  return out;
}

/** Resolve a friendly skill label for `{focus}` in practice_skill titles. */
export async function skillLabel(slug: string): Promise<string> {
  const rows = await getDb().select({ label: skill.label }).from(skill).where(eq(skill.slug, slug)).limit(1);
  return rows[0]?.label ?? slug;
}

function toView(r: typeof learnerQuest.$inferSelect): QuestView | null {
  const kind = questKindSchema.safeParse(r.kind);
  if (!kind.success) return null;
  return {
    id: r.id,
    title: r.title,
    kind: kind.data,
    target: parseJsonbFailClosed(questTargetSchema, r.target, `quest target (${r.id})`) ?? { count: 1 },
    progress: parseJsonbFailClosed(questProgressSchema, r.progress, `quest progress (${r.id})`) ?? { done: 0 },
    rewardStars: r.rewardStars,
    status: r.status as QuestStatus,
  };
}

function dayKey(learnerId: string, programSlug: string, day: string) {
  return and(
    eq(learnerQuest.learnerId, learnerId),
    eq(learnerQuest.programSlug, programSlug),
    eq(learnerQuest.assignedOn, day),
  );
}

export async function getDailyQuests(
  accountId: string,
  learnerId: string,
  programSlug: string,
  day: string,
): Promise<QuestView[]> {
  return withOwnedLearner<QuestView[]>(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb().select().from(learnerQuest).where(dayKey(learnerId, programSlug, day));
      return rows.map(toView).filter((v): v is QuestView => v !== null);
    },
    [],
  );
}

/** Insert today's drafts idempotently (unique on learner+program+day+template),
 *  then re-read — two racing generators converge on one menu. */
export async function assignDailyQuests(
  accountId: string,
  learnerId: string,
  programSlug: string,
  day: string,
  drafts: QuestDraft[],
): Promise<QuestView[]> {
  return withOwnedLearner<QuestView[]>(
    accountId,
    learnerId,
    async () => {
      if (drafts.length > 0) {
        await getDb()
          .insert(learnerQuest)
          .values(
            drafts.map((d) => ({
              learnerId,
              templateId: d.templateId,
              programSlug,
              assignedOn: day,
              title: d.title,
              kind: d.kind,
              target: questTargetSchema.parse(d.target),
              progress: { done: 0 },
              rewardStars: d.rewardStars,
              status: "offered" as const,
            })),
          )
          .onConflictDoNothing({
            target: [
              learnerQuest.learnerId,
              learnerQuest.programSlug,
              learnerQuest.assignedOn,
              learnerQuest.templateId,
            ],
          });
      }
      const rows = await getDb().select().from(learnerQuest).where(dayKey(learnerId, programSlug, day));
      return rows.map(toView).filter((v): v is QuestView => v !== null);
    },
    [],
  );
}

/** She activates ONE quest at a time: target offered→active, any other
 *  same-day active→offered. Done quests are never demoted. */
export async function activateQuest(
  accountId: string,
  learnerId: string,
  questId: string,
  day: string,
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      return getDb().transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(learnerQuest)
          .where(and(eq(learnerQuest.id, questId), eq(learnerQuest.learnerId, learnerId)))
          .limit(1)
          .for("update");
        const target = rows[0];
        if (!target || target.assignedOn !== day || target.status !== "offered") return false;
        await tx
          .update(learnerQuest)
          .set({ status: "offered", updatedAt: new Date() })
          .where(
            and(
              dayKey(learnerId, target.programSlug, day),
              eq(learnerQuest.status, "active"),
            ),
          );
        await tx
          .update(learnerQuest)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(learnerQuest.id, questId));
        return true;
      });
    },
    false,
  );
}

/**
 * Fold one recorded attempt into today's ACTIVE quests — called INSIDE
 * recordAttempt's open transaction (all-or-nothing with the attempt row).
 * Completion flips status to done and credits rewardStars to the ledger
 * (reason quest_complete) in the same tx.
 */
export async function applyAttemptToQuests(
  tx: Db,
  learnerId: string,
  day: string,
  ctx: QuestAttemptCtx,
): Promise<void> {
  const rows = await tx
    .select()
    .from(learnerQuest)
    .where(
      and(
        eq(learnerQuest.learnerId, learnerId),
        eq(learnerQuest.assignedOn, day),
        eq(learnerQuest.status, "active"),
      ),
    )
    .for("update");
  for (const row of rows) {
    const view = toView(row);
    if (!view) continue;
    const { progress, completed } = foldQuestProgress(
      { kind: view.kind, target: view.target, progress: view.progress },
      ctx,
    );
    if (progress.done === view.progress.done) continue;
    await tx
      .update(learnerQuest)
      .set({ progress, status: completed ? "done" : "active", updatedAt: new Date() })
      .where(eq(learnerQuest.id, row.id));
    if (completed && row.rewardStars > 0) {
      await tx.insert(starLedger).values({
        learnerId,
        delta: row.rewardStars,
        reason: "quest_complete",
        refId: row.id,
      });
    }
  }
}
```

Check `src/lib/db/index.ts` for the exported DB/transaction type: if there is no `Db` type exported, type the `tx` parameter as `Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]` via a local alias — do NOT loosen it to `any`. Also confirm `parseJsonbFailClosed`'s exact signature in `src/lib/tutor/jsonb.ts` and adapt the two call sites (it may not return null — if it returns the fail-closed default instead, drop the `?? {...}`).

- [ ] **Step 4: Wire into `recordAttempt`** (`src/lib/tutor/store.ts`). Extend `RecordAttemptInput` with:

```ts
  /** Quest-fold context (Adventure 2.0): the containing unit id, resolved
   *  server-side by the action from the learner's pinned tree. Null when
   *  unresolvable — complete_n still counts; unit-targeted quests just miss. */
  unitId?: string | null;
```

Inside the transaction, AFTER the skill-evidence loop (last statement in the tx), add:

```ts
    // Adventure 2.0: fold this attempt into today's ACTIVE quests + credit any
    // completed quest's reward — inside this same transaction.
    await applyAttemptToQuests(tx, input.learnerId, input.day, {
      activityId: input.activityId,
      unitId: input.unitId ?? null,
      skills: input.score.skillEvidence.map((e) => e.skill),
      generated,
    });
```

with `import { applyAttemptToQuests } from "@/lib/quests/store";` at the top.

- [ ] **Step 5: Derive the unit in the action** (`src/app/(learner)/actions.ts`). In `recordAttemptAction`, inside the `withAccount` callback, resolve the unit BEFORE calling `recordAttempt`:

```ts
    await withAccount(async ({ accountId }) => {
      // Quest-fold context: locate the containing unit on the learner's pinned
      // tree (server-derived; never trusted from the client).
      let unitId: string | null = null;
      try {
        const program = await resolveLearnerProgram(accountId, data.learnerId, data.programSlug);
        if (program) unitId = findUnitIdOfActivity(program, data.activityId);
      } catch {
        unitId = null; // fold degrades to complete_n-only matching
      }
      return recordAttempt(accountId, {
        // …existing fields unchanged…
        unitId,
      });
    });
```

Add `import { findUnitIdOfActivity } from "@/lib/quests/logic";` (`resolveLearnerProgram` is already imported).

- [ ] **Step 6: Run** — `bun run test src/lib/tutor/store.test.ts src/lib/quests` → PASS. `bun run typecheck` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/quests/store.ts src/lib/tutor/store.ts "src/app/(learner)/actions.ts" src/lib/tutor/store.test.ts
git commit -m "feat(quests): daily assignment + activation + in-tx attempt fold with reward credit"
```

---

### Task 6: Learner rewards/quests server actions

**Files:**
- Create: `src/app/(learner)/rewards-actions.ts`
- Test: `src/app/(learner)/rewards-actions.test.ts` (result-shape tests with mocked stores, matching however existing action tests mock — check `src/lib/tutor/tutor.test.ts` first; if actions aren't unit-tested today, cover the composition helpers instead and rely on typecheck)

**Interfaces:**
- Consumes: Task 2/3/5 stores; `withAccount`, `UnauthenticatedError` from `@/lib/tenancy`; `captureNonCritical`; `resolveLearnerProgram`; `nextBest`, `strandProgress` from `@/lib/tutor/recommend`; `getSkillState`, `getCompletedActivityIds`, `getEnrollmentForGate` from `@/lib/tutor/store`; `selectDailyQuests`, `skillLabel`.
- Produces (client-safe, never throw):
  - `getRewardsStateAction(learnerId): Promise<{ signedIn: boolean; balance: number; catalog: CatalogPack[]; ownedStickerIds: string[] }>`
  - `purchaseStickerAction(learnerId, stickerId): Promise<PurchaseResult>`
  - `getDailyQuestsAction(learnerId, programSlug): Promise<QuestView[]>`
  - `activateQuestAction(learnerId, questId): Promise<{ ok: boolean }>`

- [ ] **Step 1: Create `src/app/(learner)/rewards-actions.ts`:**

```ts
"use server";

import { z } from "zod";
import { captureNonCritical } from "@/lib/capture";
import { UnauthenticatedError, withAccount } from "@/lib/tenancy";
import { getStarBalance } from "@/lib/rewards/store";
import {
  getStickerCatalog,
  listOwnedStickerIds,
  purchaseSticker,
  type CatalogPack,
  type PurchaseResult,
} from "@/lib/rewards/stickers";
import {
  activateQuest,
  assignDailyQuests,
  getDailyQuests,
  listPublishedQuestTemplates,
  skillLabel,
  type QuestView,
} from "@/lib/quests/store";
import { selectDailyQuests } from "@/lib/quests/logic";
import { outcomeOf } from "@/lib/tutor/mastery";
import { nextBest } from "@/lib/tutor/recommend";
import {
  getCompletedActivityIds,
  getEnrollmentForGate,
  getSkillState,
} from "@/lib/tutor/store";
import { resolveLearnerProgram } from "@/lib/content/repository";
import { skillTagsForProgram } from "@/content";

/**
 * Learner rewards/quests actions. Same posture as (learner)/actions.ts:
 * lazy per-request session resolution, calm empty results on unauth/failure,
 * NEVER throw to the client. Account-only (guest mode has no economy).
 */

const idSchema = z.string().min(1);

export interface RewardsState {
  signedIn: boolean;
  balance: number;
  catalog: CatalogPack[];
  ownedStickerIds: string[];
}

const EMPTY_REWARDS: RewardsState = { signedIn: false, balance: 0, catalog: [], ownedStickerIds: [] };

export async function getRewardsStateAction(learnerId: string): Promise<RewardsState> {
  if (!idSchema.safeParse(learnerId).success) return EMPTY_REWARDS;
  try {
    return await withAccount(async ({ accountId }) => {
      const [balance, catalog, ownedStickerIds] = await Promise.all([
        getStarBalance(accountId, learnerId),
        getStickerCatalog(),
        listOwnedStickerIds(accountId, learnerId),
      ]);
      return { signedIn: true, balance, catalog, ownedStickerIds };
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getRewardsStateAction failed", error);
    }
    return EMPTY_REWARDS;
  }
}

export async function purchaseStickerAction(
  learnerId: string,
  stickerId: string,
): Promise<PurchaseResult> {
  if (!idSchema.safeParse(learnerId).success || !idSchema.safeParse(stickerId).success) {
    return { ok: false, reason: "not_found" };
  }
  try {
    return await withAccount(({ accountId }) => purchaseSticker(accountId, learnerId, stickerId));
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("purchaseStickerAction failed", error);
    }
    return { ok: false, reason: "error" };
  }
}

/** Server day (YYYY-MM-DD) — the same clock recordAttemptAction stamps. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today's quest menu, generating it on first read (idempotent under races via
 * the day+template unique index). Requires an ACTIVE enrollment — same gate as
 * play itself; a paused/removed program offers no quests.
 */
export async function getDailyQuestsAction(
  learnerId: string,
  programSlug: string,
): Promise<QuestView[]> {
  if (!idSchema.safeParse(learnerId).success || !idSchema.safeParse(programSlug).success) return [];
  try {
    return await withAccount(async ({ accountId }) => {
      const gate = await getEnrollmentForGate(accountId, learnerId, programSlug);
      if (gate?.status !== "active") return [];
      const day = today();

      const existing = await getDailyQuests(accountId, learnerId, programSlug, day);
      if (existing.length > 0) return existing;

      const program = await resolveLearnerProgram(accountId, learnerId, programSlug);
      if (!program) return [];
      const [state, completed, templates] = await Promise.all([
        getSkillState(accountId, learnerId),
        getCompletedActivityIds(accountId, learnerId),
        listPublishedQuestTemplates(),
      ]);
      const recs = nextBest(program, state, new Set(completed.map((c) => c.activityId))).map((r) => ({
        unitId: r.unit.id,
        unitTitle: r.unit.title,
      }));
      const emerging = [...skillTagsForProgram(program)].filter(
        (s) => outcomeOf(state, s) === "emerging",
      );
      const drafts = selectDailyQuests(templates, recs, emerging);
      // Friendly label for the practice_skill title (the pure layer used the slug).
      for (const d of drafts) {
        if (d.kind === "practice_skill" && d.target.skill) {
          d.title = d.title.replace(d.target.skill, await skillLabel(d.target.skill));
        }
      }
      return assignDailyQuests(accountId, learnerId, programSlug, day, drafts);
    });
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("getDailyQuestsAction failed", error);
    }
    return [];
  }
}

export async function activateQuestAction(
  learnerId: string,
  questId: string,
): Promise<{ ok: boolean }> {
  if (!idSchema.safeParse(learnerId).success || !idSchema.safeParse(questId).success) {
    return { ok: false };
  }
  try {
    return await withAccount(async ({ accountId }) => ({
      ok: await activateQuest(accountId, learnerId, questId, today()),
    }));
  } catch (error) {
    if (!(error instanceof UnauthenticatedError)) {
      captureNonCritical("activateQuestAction failed", error);
    }
    return { ok: false };
  }
}
```

Verify `outcomeOf` and `skillTagsForProgram` exports exist as named (they're used in `recommend.ts` / `(learner)/actions.ts` — same imports). `skillTagsForProgram` returns an array or set — adapt the spread accordingly.

- [ ] **Step 2: Verify** — `bun run typecheck && bun run lint` → PASS (these actions are composition; their pieces are unit-tested in Tasks 2–5).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(learner)/rewards-actions.ts"
git commit -m "feat(learner): rewards + daily-quest server actions (account-only, calm-fail)"
```

---

### Task 7: Sticker book & shop UI + star chip

**Files:**
- Create: `src/app/(learner)/learn/[programSlug]/stickers/page.tsx`, `src/components/learner/StickerBook.tsx`, `src/components/learner/useRewards.ts`
- Modify: `src/components/learner/StudioHome.tsx` (star chip + stickers link in the banner)

**Interfaces:**
- Consumes: `getRewardsStateAction`, `purchaseStickerAction`, `RewardsState`; active-learner client state (see how `StudioHome`/its parent resolve the current learner id — the same hook/prop, likely from `src/components/learner/learners.ts`).
- Produces: `useRewards(learnerId: string | null): { state: RewardsState | null; refresh: () => void; purchase: (stickerId: string) => Promise<PurchaseResult> }`; route `/learn/[programSlug]/stickers`.

- [ ] **Step 1: Create `src/components/learner/useRewards.ts`:**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRewardsStateAction,
  purchaseStickerAction,
  type RewardsState,
} from "@/app/(learner)/rewards-actions";
import type { PurchaseResult } from "@/lib/rewards/stickers";

/**
 * Account-mode rewards state. Guest mode (null learnerId or signedIn:false)
 * yields state:null and the UI hides the economy entirely (spec §3.7).
 */
export function useRewards(learnerId: string | null) {
  const [state, setState] = useState<RewardsState | null>(null);

  const refresh = useCallback(() => {
    if (!learnerId) return;
    void getRewardsStateAction(learnerId).then((s) => setState(s.signedIn ? s : null));
  }, [learnerId]);

  useEffect(refresh, [refresh]);

  const purchase = useCallback(
    async (stickerId: string): Promise<PurchaseResult> => {
      if (!learnerId) return { ok: false, reason: "error" };
      const result = await purchaseStickerAction(learnerId, stickerId);
      if (result.ok) refresh();
      return result;
    },
    [learnerId, refresh],
  );

  return { state, refresh, purchase };
}
```

- [ ] **Step 2: Create the page + book.** `src/app/(learner)/learn/[programSlug]/stickers/page.tsx` — mirror the dynamic-params pattern of the sibling `[programSlug]/page.tsx` (async `params`, same `dynamic` posture):

```tsx
import { StickerBook } from "@/components/learner/StickerBook";

export default async function StickersPage({
  params,
}: {
  params: Promise<{ programSlug: string }>;
}) {
  const { programSlug } = await params;
  return <StickerBook programSlug={programSlug} />;
}
```

`src/components/learner/StickerBook.tsx` (client). Follow `StudioHome`'s conventions exactly: `AppShellKid` wrapper with `backHref={`/learn/${programSlug}`}` and a `readAloud` invitation; the active learner id from the same client source StudioHome uses (read `StudioHome.tsx`'s top ~100 lines and its parent to lift the identical pattern). Core rendering:

```tsx
"use client";

// imports: AppShellKid, useRewards, active-learner state, cn, Phosphor icons
// (StarIcon, LockSimpleIcon), Mascot — match StudioHome's import style.

const REASON_COPY: Record<string, string> = {
  insufficient: "Not enough stars yet — keep playing!",
  already_owned: "You already have this one!",
  not_found: "That sticker isn't here right now.",
  error: "Hmm, try again in a moment.",
};

export function StickerBook({ programSlug }: { programSlug: string }) {
  const learnerId = useActiveLearnerId(); // ← the same source StudioHome uses
  const { state, purchase } = useRewards(learnerId);
  const [message, setMessage] = useState<string | null>(null);

  if (!state) {
    return (
      <AppShellKid backHref={`/learn/${programSlug}`} readAloud="Your sticker book.">
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Mascot mood="happy" size={64} />
          <p className="text-lg text-ink-soft">Ask a grown-up to sign in to collect stickers!</p>
        </div>
      </AppShellKid>
    );
  }

  const owned = new Set(state.ownedStickerIds);
  return (
    <AppShellKid
      backHref={`/learn/${programSlug}`}
      readAloud={`Your sticker book. You have ${state.balance} stars to spend. Tap a sticker to get it.`}
    >
      <div className="mb-6 flex items-center justify-between rounded-2xl border-[3px] border-ink bg-honey/30 px-5 py-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Sticker Book</h1>
        <span className="inline-flex items-center gap-1.5 rounded-pill border-2 border-ink bg-paper px-3 py-1 font-display text-lg font-semibold">
          <StarIcon weight="fill" className="size-5 text-honey" aria-hidden />
          {state.balance}
        </span>
      </div>
      {message && <p className="mb-4 text-center text-base text-ink-soft">{message}</p>}
      {state.catalog.map((pack) => (
        <section key={pack.id} className="mb-8">
          <h2 className="mb-3 font-display text-xl font-semibold">{pack.title}</h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {pack.stickers.map((s) => {
              const emoji = s.artRef.startsWith("emoji:") ? s.artRef.slice(6) : "❓";
              const has = owned.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={has}
                    onClick={async () => {
                      const r = await purchase(s.id);
                      setMessage(r.ok ? `You got ${s.title}!` : REASON_COPY[r.reason]);
                    }}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-2xl border-[3px] border-ink px-2 py-3",
                      has ? "bg-paper" : "bg-paper/60",
                    )}
                    aria-label={has ? `${s.title}, collected` : `Get ${s.title} for ${s.starCost} stars`}
                  >
                    <span aria-hidden className={cn("text-4xl", !has && "opacity-35 grayscale")}>
                      {emoji}
                    </span>
                    <span className="text-sm font-medium text-ink-soft">{s.title}</span>
                    {!has && (
                      <span className="inline-flex items-center gap-1 text-sm font-semibold">
                        <StarIcon weight="fill" className="size-4 text-honey" aria-hidden />
                        {s.starCost}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </AppShellKid>
  );
}
```

Unowned = grayscale silhouette; owned = full color; prices always visible; no randomness (spec §4.2, §13). Match exact class tokens (`border-ink`, `bg-honey/30`, `rounded-pill`, `font-display`) to what StudioHome actually uses — copy from the file, not from this plan, if they differ.

- [ ] **Step 3: Star chip on the map.** In `StudioHome.tsx`'s banner (next to the "Switch worlds" link, `src/components/learner/StudioHome.tsx:388-394`), add — account mode only (`useRewards` returns null state for guests):

```tsx
{rewards && (
  <Link
    href={`/learn/${program.slug}/stickers`}
    className="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-ink bg-paper px-3 font-display text-base font-semibold"
    aria-label={`${rewards.balance} stars. Open your sticker book.`}
  >
    <StarIcon weight="fill" className="size-5 text-honey" aria-hidden />
    {rewards.balance}
  </Link>
)}
```

wiring `const { state: rewards } = useRewards(mode === "account" ? learnerId : null);` — read the component's existing props/state to find the exact `mode`/`learnerId` names it already holds.

- [ ] **Step 4: Verify** — `bun run lint && bun run typecheck && bun run build` → PASS. Manually: `bun run dev`, sign in, visit `/learn/kaelyn-adaptive/stickers` (empty catalog until Task 12 seeds — the page renders the signed-out/empty states cleanly).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(learner)/learn/[programSlug]/stickers/" src/components/learner/StickerBook.tsx src/components/learner/useRewards.ts src/components/learner/StudioHome.tsx
git commit -m "feat(learner): sticker book + shop page and map star chip"
```

---

### Task 8: Quest board UI — "Today's Adventures"

**Files:**
- Create: `src/components/learner/TodaysAdventures.tsx`, `src/components/learner/useQuests.ts`
- Modify: `src/components/learner/StudioHome.tsx` (render the board above the map for account mode; keep `NextThingCard` as the guest fallback; make the dailyGoal pill count quests done)

**Interfaces:**
- Consumes: `getDailyQuestsAction`, `activateQuestAction`, `QuestView`; the existing `topPick`/`NextThingCard` code path (`StudioHome.tsx:337-343, 408-411`); dailyGoal pill (`StudioHome.tsx:354-356, 396-403`).
- Produces: `useQuests(learnerId: string | null, programSlug: string): { quests: QuestView[] | null; activate: (id: string) => Promise<void>; refresh: () => void }`.

- [ ] **Step 1: Create `useQuests.ts`** (same shape as `useRewards` — null for guests, fetch on mount, `activate` calls the action then refreshes). Refresh also on window focus so completing an activity updates the board when she returns to the map:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { activateQuestAction, getDailyQuestsAction } from "@/app/(learner)/rewards-actions";
import type { QuestView } from "@/lib/quests/store";

export function useQuests(learnerId: string | null, programSlug: string) {
  const [quests, setQuests] = useState<QuestView[] | null>(null);

  const refresh = useCallback(() => {
    if (!learnerId) return;
    void getDailyQuestsAction(learnerId, programSlug).then((q) =>
      setQuests(q.length > 0 ? q : null),
    );
  }, [learnerId, programSlug]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const activate = useCallback(
    async (id: string) => {
      if (!learnerId) return;
      await activateQuestAction(learnerId, id);
      refresh();
    },
    [learnerId, refresh],
  );

  return { quests, activate, refresh };
}
```

- [ ] **Step 2: Create `TodaysAdventures.tsx`** — a card panel: title "Today's Adventures", one row per quest. Offered → a big tappable card ("I'll do this one!"); active → progress dots (`progress.done`/`target.count`) + a soft glow; done → checked with a star burst count. Completion is celebratory, non-punitive; no timers (spec §4.1). Skeleton:

```tsx
"use client";

// imports: cn, Phosphor (StarIcon, CheckCircleIcon, CompassIcon), QuestView

export function TodaysAdventures({
  quests,
  onActivate,
  reduce,
}: {
  quests: QuestView[];
  onActivate: (id: string) => void;
  reduce: boolean;
}) {
  return (
    <section
      aria-label="Today's adventures"
      className="mb-8 rounded-2xl border-[3px] border-ink bg-paper px-5 py-4"
    >
      <h2 className="mb-3 inline-flex items-center gap-2 font-display text-xl font-semibold">
        <CompassIcon weight="bold" className="size-6" aria-hidden />
        Today&apos;s Adventures
      </h2>
      <ul className="flex flex-col gap-2">
        {quests.map((q) => (
          <li key={q.id}>
            {q.status === "done" ? (
              <div className="flex items-center gap-3 rounded-xl border-2 border-ink/20 bg-honey/20 px-4 py-3">
                <CheckCircleIcon weight="fill" className="size-7 text-ink" aria-hidden />
                <span className="flex-1 font-medium">{q.title}</span>
                <span className="inline-flex items-center gap-1 font-display font-semibold">
                  +{q.rewardStars} <StarIcon weight="fill" className="size-4 text-honey" aria-hidden />
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => q.status === "offered" && onActivate(q.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left",
                  q.status === "active" ? "border-ink bg-honey/30" : "border-ink/30 bg-paper",
                )}
                aria-pressed={q.status === "active"}
              >
                <span className="flex-1 font-medium">{q.title}</span>
                <span aria-label={`${q.progress.done} of ${q.target.count} done`} className="flex gap-1">
                  {Array.from({ length: q.target.count }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={cn(
                        "size-3 rounded-full border-2 border-ink",
                        i < q.progress.done ? "bg-honey" : "bg-paper",
                      )}
                    />
                  ))}
                </span>
                <span className="inline-flex items-center gap-1 font-display text-sm font-semibold text-ink-soft">
                  +{q.rewardStars} <StarIcon weight="fill" className="size-4 text-honey" aria-hidden />
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

(`reduce` reserved for a motion-safe star-burst on completion — add a simple `motion.div` scale-in on the done row when `!reduce`, mirroring `NextThingCard`'s motion props.)

- [ ] **Step 3: Integrate in `StudioHome.tsx`.** Where `NextThingCard` renders (`{topPick && <NextThingCard …/>}`):

```tsx
{quests ? (
  <TodaysAdventures quests={quests} onActivate={activate} reduce={Boolean(reduce)} />
) : (
  topPick && <NextThingCard pick={topPick} programSlug={program.slug} reduce={Boolean(reduce)} />
)}
```

with `const { quests, activate } = useQuests(mode === "account" ? learnerId : null, program.slug);`. Guests (and quest-less days, e.g. no published templates) keep the existing single-pick card — no regression.

Then repoint the **dailyGoal pill** (spec §4.1 — from display-only to the board's target): when `quests` is non-null, show `{quests.filter((q) => q.status === "done").length} / {quests.length} adventures done` instead of the activity count; when null, keep the existing count. Keep it a pill — no enforcement, nothing locks.

- [ ] **Step 4: Verify** — `bun run lint && bun run typecheck && bun run build` → PASS. Manual: with no published templates the map is unchanged (guest AND account). (Full quest flow becomes demoable after Task 12 seeds.)

- [ ] **Step 5: Commit**

```bash
git add src/components/learner/TodaysAdventures.tsx src/components/learner/useQuests.ts src/components/learner/StudioHome.tsx
git commit -m "feat(learner): Today's Adventures quest board with guest fallback + quest-aware daily goal"
```

---

### Task 9: Interests — store, child picker, parent gate, AI theming

**Files:**
- Create: `src/lib/interests/store.ts`, `src/app/(learner)/learn/interests/page.tsx`, `src/components/learner/InterestPicker.tsx`
- Modify: `src/app/(learner)/rewards-actions.ts` (2 interest actions), `src/app/(parent)/actions.ts` (1 action), the parent learner-settings page (Interests section), `src/lib/ai/practice.ts` (+ its route `src/app/api/practice/route.ts`)
- Test: `src/lib/interests/store.test.ts` (pure subset-validation), extend `src/lib/ai/` prompt test if one exists

**Interfaces:**
- Consumes: `interest`, `learnerInterest` tables; `withOwnedLearner`.
- Produces:
  - `interface InterestView { id: string; slug: string; label: string; icon: string | null }`
  - `listPublishedInterests(): Promise<InterestView[]>`
  - `getLearnerInterests(accountId, learnerId): Promise<{ offered: InterestView[]; picked: InterestView[] }>`
  - `setOfferedInterests(accountId, learnerId, interestIds: string[]): Promise<boolean>` (parent; replaces `source="parent"` rows; also prunes child picks no longer offered)
  - `setPickedInterests(accountId, learnerId, interestIds: string[]): Promise<boolean>` (child; validated ⊆ offered, max 5, replaces `source="child"` rows)
  - `pickedInterestLabels(accountId, learnerId): Promise<string[]>` (for the AI route; ≤5 labels)
  - `validatePicks(pickedIds: string[], offeredIds: string[]): string[] | null` — PURE (null = invalid)
  - actions: learner `getInterestsAction(learnerId)`, `setPickedInterestsAction(learnerId, ids)`; parent `setOfferedInterestsAction(learnerId, ids)`
  - `generatePracticeItems` gains `options.interests?: string[]`

- [ ] **Step 1: Pure test first** — `src/lib/interests/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePicks } from "./store";

describe("validatePicks", () => {
  it("accepts picks that are a subset of offered, deduped, max 5", () => {
    expect(validatePicks(["a", "b", "a"], ["a", "b", "c"])).toEqual(["a", "b"]);
  });
  it("rejects a pick outside the offered set", () => {
    expect(validatePicks(["a", "z"], ["a", "b"])).toBeNull();
  });
  it("rejects more than 5 picks", () => {
    expect(validatePicks(["a", "b", "c", "d", "e", "f"], ["a", "b", "c", "d", "e", "f"])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — FAIL. Then create `src/lib/interests/store.ts`:

```ts
// server-only: opens DB connections; import from server actions / route handlers only.
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { interest, learnerInterest } from "@/lib/db/schema";
import { withOwnedLearner } from "@/lib/tutor/scope";

export interface InterestView {
  id: string;
  slug: string;
  label: string;
  icon: string | null;
}

const MAX_PICKS = 5;

/** PURE: dedupe + bound + subset-validate child picks against the offered set.
 *  Returns the cleaned ids, or null when any pick is outside the offered set /
 *  over the cap (the action then reports invalid; nothing is written). */
export function validatePicks(pickedIds: string[], offeredIds: string[]): string[] | null {
  const offered = new Set(offeredIds);
  const deduped = [...new Set(pickedIds)];
  if (deduped.length > MAX_PICKS) return null;
  if (deduped.some((id) => !offered.has(id))) return null;
  return deduped;
}

export async function listPublishedInterests(): Promise<InterestView[]> {
  const rows = await getDb()
    .select()
    .from(interest)
    .where(eq(interest.status, "published"))
    .orderBy(asc(interest.label));
  return rows.map((r) => ({ id: r.id, slug: r.slug, label: r.label, icon: r.icon }));
}

export async function getLearnerInterests(
  accountId: string,
  learnerId: string,
): Promise<{ offered: InterestView[]; picked: InterestView[] }> {
  return withOwnedLearner(
    accountId,
    learnerId,
    async () => {
      const rows = await getDb()
        .select({
          id: interest.id,
          slug: interest.slug,
          label: interest.label,
          icon: interest.icon,
          source: learnerInterest.source,
        })
        .from(learnerInterest)
        .innerJoin(interest, eq(learnerInterest.interestId, interest.id))
        .where(and(eq(learnerInterest.learnerId, learnerId), eq(interest.status, "published")))
        .orderBy(asc(interest.label));
      const view = (r: (typeof rows)[number]): InterestView => ({
        id: r.id, slug: r.slug, label: r.label, icon: r.icon,
      });
      return {
        offered: rows.filter((r) => r.source === "parent").map(view),
        picked: rows.filter((r) => r.source === "child").map(view),
      };
    },
    { offered: [], picked: [] },
  );
}

/** Parent gate: replace the offered set; prune child picks no longer offered. */
export async function setOfferedInterests(
  accountId: string,
  learnerId: string,
  interestIds: string[],
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      const ids = [...new Set(interestIds)].slice(0, 30);
      await getDb().transaction(async (tx) => {
        await tx
          .delete(learnerInterest)
          .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "parent")));
        if (ids.length > 0) {
          await tx
            .insert(learnerInterest)
            .values(ids.map((interestId) => ({ learnerId, interestId, source: "parent" as const })));
        }
        // Child picks must stay ⊆ offered: prune any pick now outside the set.
        if (ids.length > 0) {
          const picks = await tx
            .select({ id: learnerInterest.id, interestId: learnerInterest.interestId })
            .from(learnerInterest)
            .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "child")));
          const allowed = new Set(ids);
          const stale = picks.filter((p) => !allowed.has(p.interestId)).map((p) => p.id);
          if (stale.length > 0) {
            await tx.delete(learnerInterest).where(inArray(learnerInterest.id, stale));
          }
        } else {
          await tx
            .delete(learnerInterest)
            .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "child")));
        }
      });
      return true;
    },
    false,
  );
}

/** Child pick: validated ⊆ offered (server-authoritative), replace-all. */
export async function setPickedInterests(
  accountId: string,
  learnerId: string,
  interestIds: string[],
): Promise<boolean> {
  return withOwnedLearner<boolean>(
    accountId,
    learnerId,
    async () => {
      const offered = await getDb()
        .select({ interestId: learnerInterest.interestId })
        .from(learnerInterest)
        .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "parent")));
      const cleaned = validatePicks(interestIds, offered.map((o) => o.interestId));
      if (cleaned === null) return false;
      await getDb().transaction(async (tx) => {
        await tx
          .delete(learnerInterest)
          .where(and(eq(learnerInterest.learnerId, learnerId), eq(learnerInterest.source, "child")));
        if (cleaned.length > 0) {
          await tx
            .insert(learnerInterest)
            .values(cleaned.map((interestId) => ({ learnerId, interestId, source: "child" as const })));
        }
      });
      return true;
    },
    false,
  );
}

/** The ≤5 picked labels for AI practice theming (§8: bounded preset labels
 *  from the admin-authored taxonomy — the ONLY interest text AI ever sees). */
export async function pickedInterestLabels(accountId: string, learnerId: string): Promise<string[]> {
  const { picked } = await getLearnerInterests(accountId, learnerId);
  return picked.slice(0, 5).map((p) => p.label);
}
```

- [ ] **Step 3: Actions.** In `rewards-actions.ts` add `getInterestsAction(learnerId)` / `setPickedInterestsAction(learnerId, interestIds: string[])` following the exact calm-fail pattern of the other actions there (empty `{offered:[],picked:[]}` / `{ok:false}`). In `(parent)/actions.ts` add `setOfferedInterestsAction(learnerId, interestIds)` following that file's existing validated-action pattern (find an existing simple action like the learner-settings one and mirror its zod-parse + `withAccount` + result shape, then `revalidatePath` the learner detail page the way its neighbors do).

- [ ] **Step 4: Child picker UI.** `src/app/(learner)/learn/interests/page.tsx` renders `<InterestPicker />` (client). Picker: big emoji chips from `offered`, tap toggles (cap 5 with a gentle "5 picked!" note), TTS `readAloud` labels, Save button calling `setPickedInterestsAction`, then router-back. Empty `offered` → calm "Ask a grown-up to pick some favorites with you!" state. Entry point: in `StudioHome`'s banner add a small heart/sparkle icon-link `href="/learn/interests"` with `aria-label="Pick your favorite things"` — account mode only. Follow `StickerBook`'s structure (AppShellKid, class tokens, Mascot empty-states).

- [ ] **Step 5: Parent Interests section.** On the parent learner settings page (`src/app/(parent)/parent/learners/[id]/settings/` — find the exact settings form component), add an "Interests" card: all published interests as checkboxes (checked = offered), save via `setOfferedInterestsAction`, using the same `useAsyncAction` + `StatusMessage` plumbing the surrounding forms use. Include a one-line explainer: "Kaelyn can pick up to 5 of the interests you enable. Her picks theme her AI practice stories."

- [ ] **Step 6: AI theming.** In `src/lib/ai/practice.ts`:
  - `GeneratePracticeOptions` gains `interests?: string[]`.
  - `buildUserPrompt(kind, band, focus, n, skillHints, interests: string[] = [])` — add after `bandNote`:

```ts
    interests.length
      ? `Where it fits naturally, theme items around what this child loves: ${fenceUntrusted(interests.slice(0, 5).join(", "))}. Never force a theme onto phonics/letter mechanics.`
      : "",
```

  - Thread `options.interests ?? []` through the non-language `buildUserPrompt` call site only (world-languages prompts stay inventory-constrained — do not thread interests there).
  - In `src/app/api/practice/route.ts`: after the existing gate resolves (it already has `accountId` + `learnerId`), fetch `const interests = await pickedInterestLabels(accountId, learnerId);` and pass `{ interests }` into the `generatePracticeItems` options. Fail-open: wrap in try/catch → `[]` (theming is garnish, never a blocker).

- [ ] **Step 7: Run everything** — `bun run test && bun run typecheck && bun run lint && bun run build` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/interests/ "src/app/(learner)/learn/interests/" src/components/learner/InterestPicker.tsx "src/app/(learner)/rewards-actions.ts" "src/app/(parent)/" src/lib/ai/practice.ts src/app/api/practice/route.ts src/components/learner/StudioHome.tsx
git commit -m "feat(interests): parent-gated child interest picker + bounded AI practice theming"
```

---

### Task 10: COPPA export coverage + parent Rewards panel

**Files:**
- Modify: `src/lib/tutor/store.ts` (`gatherLearnerExport`), `src/lib/tutor/export.ts` (shape), `src/lib/tutor/export.test.ts`, the parent learner detail/settings page (Rewards panel), `src/app/(parent)/actions.ts` (`grantBonusStarsAction`), `src/app/(parent)/data.ts` (rewards read)

**Interfaces:**
- Consumes: `listStarLedger`, `getStarBalance`, `grantBonusStars` (Task 2); `listOwnedStickerIds` + catalog (Task 3); learner quest/interest tables.
- Produces: `LearnerExport` gains `stars: { balance: number; ledger: LedgerEntry[] }`, `stickers: { stickerId: string; acquiredAt: string }[]`, `interests: { slug: string; source: string }[]`, `quests: { title: string; status: string; assignedOn: string }[]`; parent action `grantBonusStarsAction(learnerId, amount)`.

- [ ] **Step 1: Extend the export test** (`src/lib/tutor/export.test.ts`) — the shaper is pure; add fixture rows for the four new sections and assert they appear in the shaped output (mirror how existing sections are asserted). Run → FAIL.

- [ ] **Step 2: Extend `shapeLearnerExport`** in `src/lib/tutor/export.ts` — add the four fields to its input type + pass-through/shape (dates → ISO strings). Match the existing shaping style (minimized, no internal ids beyond what's needed; stickers export `stickerId` + `acquiredAt`; interests export slug + source, never free text — there is none).

- [ ] **Step 3: Extend `gatherLearnerExport`** in `src/lib/tutor/store.ts`: add the four reads to the existing `Promise.all` (ledger bounded to 500 newest, quests bounded to 200 newest) and pass them to the shaper. Deletion needs NO change — all five new learner tables cascade off `learner.id` (verify each FK in Task 1's migration says `on delete cascade`) and account deletion cascades through learner. Add one sentence to the `deleteAccount` doc-comment cascade diagram listing the new tables.

- [ ] **Step 4: Parent Rewards panel.** On the parent learner detail page: star balance, last ~10 ledger entries (reason → friendly copy: `activity_complete` "Finished an activity", `quest_complete` "Completed a quest", `sticker_purchase` "Got a sticker", `adjustment` "Bonus from you"), and a "Give bonus stars" numeric input (1–20) + button → `grantBonusStarsAction(learnerId, amount)` (new action in `(parent)/actions.ts`, zod `z.number().int().min(1).max(20)`, `withAccount` → `grantBonusStars`, existing result-shape + `revalidatePath` conventions). Read side: add `getLearnerRewards(accountId, learnerId)` to `(parent)/data.ts` composing balance + ledger page.

- [ ] **Step 5: Run** — `bun run test && bun run typecheck && bun run lint && bun run build` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tutor/ "src/app/(parent)/" 
git commit -m "feat(coppa+parent): export the new learner-state tables + parent rewards panel with bonus stars"
```

---

### Task 11: Branching map — types, unlock logic, admin field, fork rendering

**Files:**
- Create: `src/components/learner/branching.ts`, `src/components/learner/branching.test.ts`
- Modify: `src/content/types.ts` (`Unit.branchKey`), `src/lib/content/store.ts` (assemble + save round-trip `branchKey`), `src/app/(admin)/admin/actions.ts` (`editableUnitSchema` + `branchKey`), `src/lib/admin/editor-model.ts` (+ editor unit form field in `src/components/admin/editor/`), `src/components/learner/StudioHome.tsx` (unlock + fork rendering)

**Interfaces:**
- Consumes: `unit.branchKey` column (Task 1); `Unit` type.
- Produces: `Unit.branchKey?: string`; pure `computeUnlockedIds(units: { id: string; branchKey?: string }[], started: Set<string>): Set<string>`; `segmentUnits(units)` (exported for rendering).

**Branching model** (spec §4.4): consecutive units with non-null `branchKey` form a **fork group**; within the group, units sharing the same `branchKey` value are one branch, in array order. Unlock rules (forgiving, matches today's `prevDone = completed > 0` posture):
1. The first segment (solo unit or whole fork group) is unlocked.
2. A segment unlocks when the previous segment is **started** (any unit in it has a completion). For a fork group, ALL branches' first units unlock together — that's the "choose your path" moment.
3. Within a branch, each unit unlocks when the previous unit **in that branch** is started.
4. Branches never lock each other — the un-chosen path stays visible and playable (choice, not lockout).

- [ ] **Step 1: Write the failing test** — `src/components/learner/branching.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeUnlockedIds, segmentUnits } from "./branching";

const U = (id: string, branchKey?: string) => ({ id, branchKey });

describe("segmentUnits", () => {
  it("groups consecutive branch-keyed units into one fork segment", () => {
    const segs = segmentUnits([U("a"), U("b1", "left"), U("b2", "left"), U("c1", "right"), U("d")]);
    expect(segs).toEqual([
      { kind: "solo", unit: U("a") },
      { kind: "fork", branches: [{ key: "left", units: [U("b1", "left"), U("b2", "left")] }, { key: "right", units: [U("c1", "right")] }] },
      { kind: "solo", unit: U("d") },
    ]);
  });
});

describe("computeUnlockedIds", () => {
  const units = [U("a"), U("b1", "left"), U("b2", "left"), U("c1", "right"), U("d")];
  it("unlocks the first segment only, before anything is started", () => {
    expect(computeUnlockedIds(units, new Set())).toEqual(new Set(["a"]));
  });
  it("starting the pre-fork unit unlocks BOTH branch heads (choose your path)", () => {
    expect(computeUnlockedIds(units, new Set(["a"]))).toEqual(new Set(["a", "b1", "c1"]));
  });
  it("progress within a branch unlocks the next unit in THAT branch only", () => {
    expect(computeUnlockedIds(units, new Set(["a", "b1"]))).toEqual(new Set(["a", "b1", "b2", "c1"]));
  });
  it("starting ANY branch unlocks the post-fork segment", () => {
    expect(computeUnlockedIds(units, new Set(["a", "c1"]))).toEqual(
      new Set(["a", "b1", "c1", "d"]),
    );
  });
  it("a fully linear program matches today's behavior", () => {
    const linear = [U("x"), U("y"), U("z")];
    expect(computeUnlockedIds(linear, new Set())).toEqual(new Set(["x"]));
    expect(computeUnlockedIds(linear, new Set(["x"]))).toEqual(new Set(["x", "y"]));
  });
});
```

- [ ] **Step 2: Run** — FAIL. Then create `src/components/learner/branching.ts`:

```ts
/** Branching world-map model (spec §4.4). Pure — unit-tested without React. */

interface BranchableUnit {
  id: string;
  branchKey?: string;
}

export type Segment<T extends BranchableUnit> =
  | { kind: "solo"; unit: T }
  | { kind: "fork"; branches: { key: string; units: T[] }[] };

/** Consecutive non-null branchKey units form ONE fork segment; branches keep
 *  first-appearance order; everything else is a solo segment. */
export function segmentUnits<T extends BranchableUnit>(units: T[]): Segment<T>[] {
  const segments: Segment<T>[] = [];
  let fork: { key: string; units: T[] }[] | null = null;
  for (const unit of units) {
    if (unit.branchKey) {
      fork ??= [];
      let branch = fork.find((b) => b.key === unit.branchKey);
      if (!branch) {
        branch = { key: unit.branchKey, units: [] };
        fork.push(branch);
      }
      branch.units.push(unit);
    } else {
      if (fork) {
        segments.push({ kind: "fork", branches: fork });
        fork = null;
      }
      segments.push({ kind: "solo", unit });
    }
  }
  if (fork) segments.push({ kind: "fork", branches: fork });
  return segments;
}

function segmentStarted<T extends BranchableUnit>(seg: Segment<T>, started: Set<string>): boolean {
  if (seg.kind === "solo") return started.has(seg.unit.id);
  return seg.branches.some((b) => b.units.some((u) => started.has(u.id)));
}

/**
 * Forgiving unlock (extends today's "previous started" gate):
 * first segment open; each later segment opens when the previous segment is
 * started; inside a fork, every branch HEAD opens with the segment, and each
 * later unit opens when its predecessor IN THE SAME BRANCH is started.
 */
export function computeUnlockedIds<T extends BranchableUnit>(
  units: T[],
  started: Set<string>,
): Set<string> {
  const unlocked = new Set<string>();
  const segments = segmentUnits(units);
  segments.forEach((seg, i) => {
    const open = i === 0 || segmentStarted(segments[i - 1], started);
    if (!open) return;
    if (seg.kind === "solo") {
      unlocked.add(seg.unit.id);
      return;
    }
    for (const branch of seg.branches) {
      branch.units.forEach((u, j) => {
        if (j === 0 || started.has(branch.units[j - 1].id)) unlocked.add(u.id);
      });
    }
  });
  return unlocked;
}
```

- [ ] **Step 3: Run** — PASS.

- [ ] **Step 4: Plumb `branchKey` end-to-end.**
  - `src/content/types.ts`: add `branchKey?: string;` to `interface Unit` (after `checkpoint`).
  - `src/lib/content/store.ts`: find `assembleProgram`'s unit mapping and carry `branchKey: row.branchKey ?? undefined`; find `saveVersionTree`'s unit insert and persist `branchKey`; find the `EditableUnit` type and add `branchKey?: string`. (Grep anchors: `assembleProgram`, `unitKey`, `EditableUnit`.)
  - `src/app/(admin)/admin/actions.ts`: `editableUnitSchema` gains `branchKey: z.string().min(1).max(40).optional(),`.
  - `src/lib/admin/editor-model.ts` + the unit form in `src/components/admin/editor/` (likely `ProgramEditor.tsx` or a `UnitFields` child): carry + render a small optional "Branch key" text input with helper text "Units sharing a branch key render as parallel map paths." Follow the exact pattern of the existing optional `checkpoint` field — same model plumbing, same form row.
  - Static content: no changes needed (`branchKey` is optional; seed passes it through if the static type carries it — also add pass-through in `scripts/seed-content.ts`'s unit mapping, grep `checkpoint` there and mirror).

- [ ] **Step 5: Fork-aware map rendering** in `StudioHome.tsx`. Replace the sequential `prevDone/locked` computation (`StudioHome.tsx:415-423`) with the pure helper over `visibleUnits`:

```tsx
const startedIds = new Set(
  visibleUnits.filter((u) => computeUnitProgress(u, progressMap).completed > 0).map((u) => u.id),
);
const unlockedIds = computeUnlockedIds(visibleUnits, startedIds);
```

then `const locked = !unlockedIds.has(unit.id);` inside the map. Rendering forks: keep the existing single-column path, but give branch units a visible path badge — pass a new optional `branch?: string` prop to `WorldTile` rendering a small pill (`unit.branchKey` prettified: `left → "Path 1"` by first-appearance index, computed via `segmentUnits`), and insert a full-width "✨ Choose your path!" divider `<li>` before each fork group's first tile. Both branches stay playable (rule 4) — no other layout change in v1.

- [ ] **Step 6: Run** — `bun run test && bun run typecheck && bun run lint && bun run build` → PASS. Existing linear programs must behave identically (the "fully linear" test above is the guard).

- [ ] **Step 7: Commit**

```bash
git add src/components/learner/branching.ts src/components/learner/branching.test.ts src/content/types.ts src/lib/content/store.ts "src/app/(admin)/admin/actions.ts" src/lib/admin/ src/components/admin/ src/components/learner/StudioHome.tsx scripts/seed-content.ts
git commit -m "feat(map): branch_key fork segments — choose-your-path unlocks + admin field"
```

---

### Task 12: Admin studio sections (Stickers, Quests, Interests) + seed

**Files:**
- Create: `src/lib/rewards/admin-store.ts`, `src/lib/quests/admin-store.ts`, `src/lib/interests/admin-store.ts`, `src/app/(admin)/admin/motivation-actions.ts`, pages `src/app/(admin)/admin/stickers/page.tsx`, `src/app/(admin)/admin/quests/page.tsx`, `src/app/(admin)/admin/interests/page.tsx` (+ small client form components alongside), `scripts/seed-motivation.ts`
- Modify: the admin shell nav (find where "Programs" is linked — add the three sections)

**Interfaces:**
- Consumes: `withAdminAction`, `idParam`, `parseInput` (admin pattern); `QUEST_PARAMS_SCHEMAS`.
- Produces: admin CRUD for the three taxonomies + an idempotent seed.

**Admin store shape (one pattern × 3 files).** Each admin-store exposes `list…()`, `create…(input)`, `update…(id, input)`, `set…Status(id, status)` with zod validation at the store boundary (the `enrollmentConfigSchema.parse` convention). For quests, `params` is validated with `questParamsSchemaFor(kind)` — reject mismatched kind/params at write time. Status transitions: `draft→published→archived`, `archived→published` allowed (simple lifecycle, no version cloning — spec §2 deviation note).

- [ ] **Step 1: Write the store tests** (pure parts): quest admin-store validation (`params` must match `kind`; bad → throws ZodError; test via `expect(() => validateTemplateInput(...)).toThrow()` on an exported pure `validateTemplateInput`). Sticker admin: `artRef` must match `/^emoji:.{1,8}$/` v1 (pure `validateArtRef`). Run → FAIL → implement the three admin-stores → PASS. Keep each store ~80 lines; follow `src/lib/content/store.ts` error style (typed error classes only if the admin UI needs to switch on them — reuse `DuplicateSlugError` from content store if exported, else return-shape).

- [ ] **Step 2: Actions.** `src/app/(admin)/admin/motivation-actions.ts` (`"use server"`): 12 thin actions (`create/update/setStatus` × 3 + `listAll` reads can be direct server-component reads instead of actions). Every mutation: `withAdminAction("<name>", …)` + `parseInput(schema, …)` + `revalidatePath("/admin/stickers" | "/admin/quests" | "/admin/interests")`. Mirror `createProgramDraftAction`'s exact shape. Remember the file-local rule: **no type re-exports from a "use server" file**.

- [ ] **Step 3: Pages.** Server components reading via the admin-stores (behind the existing admin layout gate — put pages under the same `(admin)` segment so the layout's `requireAdmin` covers them; verify the admin layout gates at layout level, else call the same gate the `/admin` page uses). Each page: a table of rows (slug, title, status, kind/cost) + an inline create/edit form client component using `useAsyncAction` + `StatusMessage` (the admin form convention from `1f01534`). Quests form: kind select renders the matching params fields (`complete_n` → count number input; others → none) — this is a 3-kind switch, not a generic renderer. Stickers page groups by pack with an emoji + cost per row.

- [ ] **Step 4: Nav.** Add "Stickers", "Quests", "Interests" links beside "Programs" in the admin shell (grep `/admin` nav links in `src/components/admin/` or the admin layout).

- [ ] **Step 5: Seed.** `scripts/seed-motivation.ts` (run: `bun scripts/seed-motivation.ts`, same DB bootstrap as `scripts/seed-content.ts` — copy its connection/env preamble). Idempotent upserts by slug (`onConflictDoNothing` + update-if-exists is fine). Content:
  - **Interest taxonomy (12, published):** dinosaurs 🦕, space 🚀, ocean animals 🐬, fairies 🧚, dogs & cats 🐶, robots 🤖, princesses 👑, sports ⚽, music 🎵, drawing & art 🎨, bugs & butterflies 🦋, trucks & trains 🚂.
  - **Sticker packs (3, published), 8 stickers each, costs 3–10:** "Woodland Friends" (🦊🦉🐿️🦌🐻🐇🍄🌰), "Space Explorers" (🚀🪐⭐🌙👩‍🚀🛸☄️🌍), "Ocean Pals" (🐬🐢🐙🦀🐠🦈🐚🌊) — `artRef: "emoji:🦊"` etc., titles like "Clever Fox".
  - **Quest templates (3, published):** `daily-three` complete_n `{count: 3}` "Do 3 activities" +3⭐; `explore-strand` try_strand `{}` "Explore {focus}" +2⭐; `level-up-skill` practice_skill `{}` "Level up: {focus}" +2⭐.

- [ ] **Step 6: Run** — `bun run test && bun run typecheck && bun run lint && bun run build` → PASS. Manual: `bun run dev` → `/admin/stickers` etc. render; seed against local DB if available (`bun scripts/seed-motivation.ts`), then the learner shop shows three packs and the quest board offers three quests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rewards/admin-store.ts src/lib/quests/admin-store.ts src/lib/interests/admin-store.ts "src/app/(admin)/" src/components/admin/ scripts/seed-motivation.ts
git commit -m "feat(admin): stickers/quests/interests authoring sections + motivation seed"
```

---

### Task 13: E2E journeys + full gate

**Files:**
- Create: `e2e/specs/motivation.spec.ts`
- Modify: `scripts/e2e-cleanup.sh` if it enumerates tables (add the new learner-state tables to its sweep)

- [ ] **Step 1: Add the spec** following `e2e/` conventions (projects: parent/admin; seeded `e2e-parent` account; `E2E_ALLOW_PROD` gate — read `e2e/specs/admin.spec.ts` for fixtures/selectors style). Cover, minimally:
  - Learner map shows the star chip and "Today's Adventures" for the signed-in e2e learner.
  - Sticker page renders the catalog; a purchase with insufficient balance shows the calm "Not enough stars yet" message (don't assert a successful purchase — e2e data should stay balance-poor to keep the test idempotent).
  - Parent learner settings shows the Interests card; admin `/admin/quests` lists the seeded templates.

- [ ] **Step 2: Sweep coverage.** If `scripts/e2e-cleanup.sh` deletes per-table, add `star_ledger`, `learner_sticker`, `learner_interest`, `learner_quest` (they cascade off learner deletion — only needed if the script deletes rows, not learners).

- [ ] **Step 3: Full local gate** — `bun run lint && bun run typecheck && bun run test && bun run build` → ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/ scripts/e2e-cleanup.sh
git commit -m "test(e2e): motivation journeys — star chip, quest board, shop, admin sections"
```

---

### Task 14: Ship Phase A

- [ ] **Step 1:** Push `feature/adventure-2-phase-a`, open the PR (all 13 task commits; PR description lists spec §-refs and the one-PR COPPA rule satisfied).
- [ ] **Step 2:** Run the project's merge-ready gate (`scripts/merge-ready.sh check --pr <n>`) — the frontend detector will require the impeccable-clean pass since `src/app/**` changed.
- [ ] **Step 3:** After merge + GitOps deploy (~15 min Forgejo cron), run the ops steps: `bun scripts/seed-motivation.ts` against prod (or via the cluster psql fallback), verify `/api/health`, canary the learner map / sticker page / quest board / admin sections per `DEPLOY.md`, remembering the known cold-start-504 and canary-noise notes in `docs/claude/`.
- [ ] **Step 4:** Confirm migration 0009 applied (journal 8→9) via the migrate initContainer logs.

---

## Self-Review Notes (already applied)

- **Spec coverage:** §3.1–§3.4 → Tasks 1–8; §3.6+§4.4 → Task 11; §4.2 → Task 7; §4.3+§7 → Task 9; §5 → Tasks 9/10; §6 → Task 12; §3.7 guest posture → guest fallbacks in Tasks 7/8/9; §12 export-same-PR → Task 10 inside the single Phase A PR. `checkpoint_result` (§3.5) is deliberately **Phase C**, not here.
- **Type consistency:** `QuestView`/`QuestDraft`/`QuestAttemptCtx`/`RewardsState`/`CatalogPack`/`PurchaseResult`/`InterestView` are defined once (Tasks 1–6) and imported by name everywhere later.
- **Known judgment calls implementers must not "fix":** first-completion-only ledger earns (grind-proof), generated practice counts toward quests but not ledger, one active quest at a time, no "expired" status, emoji `artRef` v1, fork rendering as badged single-column v1.
