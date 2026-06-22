# Curriculum Marketplace & Management — Implementation Plan (master)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a **master plan** decomposed into 6 independently-shippable slices; Slice 1 is fully TDD-detailed, Slices 2–6 are specified (files + interfaces + tasks) and expanded to bite-sized steps at execution time.

**Goal:** Move curriculum from static TypeScript into a versioned, DB-backed store with an admin authoring studio, a parent-facing marketplace to browse/assign/configure programs per child, soft-remove enrollment lifecycle, per-child settings persistence, and per-child data export/delete.

**Architecture:** Curriculum becomes normalized Postgres content (`program → program_version → unit → lesson → activity`, plus a `skill` rubric table and a `publisher`), edited through an immutable-version publish lifecycle (draft → published → archived; editing a published program clones a new draft version). The runtime reads content through a new **async content repository** that assembles the existing `Program` TS object from rows and validates each `activity.config` against the existing `ACTIVITY_CONFIG_SCHEMAS` — so the activity-type **plugins, mastery engine, and recommender stay unchanged**. Enrollment gains a pinned `program_version_id`, a `status` lifecycle, and a typed `config` (band / active units / AI / daily goal). The admin authoring editor is **custom** (React Hook Form + dnd-kit + a Zod-schema→fields renderer), reusing our Wonder Studio components; we deliberately did **not** adopt a CMS because the differentiated parts (pronunciation/phoneme controls wired to our TTS, multi-lingual symbol authoring, `.refine()` invariants) are custom either way.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), React 19, TypeScript strict, bun, Drizzle ORM + PostgreSQL (CloudNativePG), Better Auth, Tailwind v4 "Wonder Studio", Phosphor icons, Zod 4. New libraries (verified versions, June 2026): `react-hook-form@7.80` + `@hookform/resolvers@5.4`, `@dnd-kit/core@6.3` + `@dnd-kit/sortable@10` + `@dnd-kit/utilities`, `fractional-indexing@3.2`, `drizzle-zod@0.8.3` (already a dependency), and Radix primitives + `cmdk` for admin-only widgets.

**Design source:** `docs/specs/2026-06-13-platform-v3-design.md` §5 (content model), plus the architecture decisions captured in the build session of 2026-06-21 (Approach B, custom editor, skills-in-DB, both UI surfaces, soft-remove, full config knobs).

---

## Global Constraints (every task inherits these)

- **Package manager is bun.** Never npm/yarn/pnpm. Run one test: `bun run test src/path/file.test.ts`. Full gate: `bun run lint && bun run typecheck && bun run test && bun run build`.
- **Testing convention (important — there is NO live test DB):** `getDb()` is never hit in tests. Unit-test **pure functions** (Zod schemas, mapping/transform helpers, `REQUIRED_COLUMNS`) and assert DB *call sequences* via the hand-rolled fake-`tx` pattern in `src/lib/tutor/store.test.ts`. Structure DB code so the logic is a pure transform with a thin `getDb()` glue around it; the glue is verified **manually** (run a script against the dev DB via `scripts/db.sh`, then check `/api/health`). Do NOT add pglite/testcontainers/pg-mem — keep the suite pure + fast.
- **Build-safety (non-negotiable):** never call `getDb()`/`getAuth()`/`getEnv()`/network at module top level. Lazy, per-request only. New content reads use lazy `getDb()` inside functions; the async repository must not connect at import.
- **Never disable a lint rule, never `@ts-ignore`, never ignore a warning.** Fix the root cause.
- **Tenancy:** every learner-scoped read/write goes through `withAccount()`/`requireAccount()` (`src/lib/tenancy.ts`). Content (program/version/unit/lesson/activity/skill/publisher) is **global**, not account-scoped; enrollment/config/progress/settings are account-/learner-scoped.
- **Health canary:** every new table + every actively-queried/NOT-NULL column MUST be added to `REQUIRED_COLUMNS` in `src/lib/db/health.ts` in the same change as the schema, or the deploy canary 503s.
- **Loose progress refs are deliberate — preserve them.** `attempt.activityId`, `skill_state.skill`, and `enrollment.programSlug` are string refs with no FK so progress survives content edits/removal. Content/config reference **stable authored keys** (`activityKey`, `unitKey`, skill `slug`), never per-version row UUIDs.
- **Design system:** OKLCH tokens from `globals.css` only; **static class maps** (no dynamic `bg-${x}`); `cn()` from `@/lib/cn` (no tailwind-merge); Phosphor via `@phosphor-icons/react/dist/ssr`; kid/parent surfaces stay bespoke. Admin-only complex widgets may use Radix/cmdk primitives **styled with our tokens** — never the shadcn CLI/theme, never `tailwind-merge`/`cva`.
- **Server actions** return discriminated results (`{ ok: true, ... } | { ok: false, reason, message }`), never throw to the client; Zod-validate input; `revalidatePath`/`revalidateTag` after writes; `captureNonCritical` for non-fatal failures.
- **No durable production data exists yet** — clean cutovers and reseeds are acceptable; no backward-compat migration of learner progress is required. Migrations remain append-only/expand-only per deploy (canary discipline) but we may reshape freely between deploys.
- **AI:** all model calls go through `chatJSON` in `@/lib/ai/models`; child-facing AI stays bounded + schema-validated (spec §8).

---

## Coordination: TTS phonemes + multi-lingual (READ FIRST)

A **parallel agent is actively reworking TTS phonemes** (foreign-language pronunciation) in: `src/lib/audio/*`, `src/components/learner/speak.ts`, `src/components/learner/narrate.ts`, `src/activities/_shared/useSpeech.ts`, and the TTS-call sites in `src/lib/ai/practice.ts`. The `POST /api/tts` route hashes text → returns a cached/synth mp3.

**Rules for this plan:**
- **Do NOT modify any TTS-pipeline file** listed above. The editor's pronunciation control **consumes `/api/tts` read-only** (a "preview" button) and writes pronunciation data into content; it never changes synthesis.
- **Multi-lingual is first-class:** `program_version` carries `locale` + `languages[]`; the marketplace and editor treat language as a visible dimension (the existing `world-languages` program seeds as a 4-language program).
- **Pronunciation seam (RESOLVED — see `[[kokoro-phoneme-overrides]]`):** Kokoro/misaki voices **inline IPA overrides** written into the spoken text as `[label](/IPA/)`. So pronunciation overrides live **inside `activity.config`'s spoken strings** — there is **no separate `pronunciation` column**. Slice 5's pronunciation control is an authoring aid that produces + verifies these inline overrides: it may call a read-only `/dev/phonemize` proxy (ground-truth IPA from the kokoro svc) and `/api/tts` (preview), and may import `src/lib/audio/phonemes.ts` (`withPhonemes`) read-only. It MUST NOT modify any TTS-pipeline file.

---

## New dependencies (install once, Slice boundaries noted)

```bash
# Slice 2 (repository) — drizzle-zod is already in package.json; nothing to add.
# Slice 5 (admin editor):
bun add react-hook-form @hookform/resolvers @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities fractional-indexing
bun add @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-popover cmdk
```
Skip (per research): `zod-to-json-schema` (Zod 4 native `z.toJSONSchema`), RJSF/AutoForm, shadcn CLI, XState, any export lib. `@tanstack/react-table` only if the admin list later needs multi-sort/filter — not now.

---

## Shared schema (Slice 1 lands this; all slices consume it)

All additions go in `src/lib/db/schema.ts`. `uuid()` and the auth `user` import already exist there.

```ts
/* ── Publisher (future multi-publisher seam; builtin now) ───────────────────── */
export const publisher = pgTable("publisher", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("builtin"), // builtin | admin | third_party
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Program: stable catalog identity across versions ───────────────────────── */
export const program = pgTable("program", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(),
  publisherId: text("publisher_id").references(() => publisher.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"), // draft | published | archived
  // Pointer to the currently-published version row id. Plain text (no FK) to avoid a
  // program<->program_version circular constraint; loose-ref philosophy. Null until first publish.
  publishedVersionId: text("published_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Program version: an immutable-once-published content snapshot ───────────── */
export const programVersion = pgTable(
  "program_version",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    programId: text("program_id").notNull().references(() => program.id, { onDelete: "cascade" }),
    version: integer("version").notNull(), // 1,2,3...
    status: text("status").notNull().default("draft"), // draft | published | archived
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    ageBand: text("age_band"),
    summary: text("summary"),
    world: text("world"), // default visual world
    locale: text("locale"), // primary BCP-47 locale, e.g. "en-US"
    languages: jsonb("languages").$type<string[]>().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("program_version_program_version_uq").on(t.programId, t.version)],
);

/* ── Unit / Lesson / Activity: ordered via fractional-indexing text keys ─────── */
export const unit = pgTable(
  "unit",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    programVersionId: text("program_version_id").notNull().references(() => programVersion.id, { onDelete: "cascade" }),
    unitKey: text("unit_key").notNull(), // stable authored id; enrollment.config.activeUnitKeys references this
    orderKey: text("order_key").notNull(),
    title: text("title").notNull(),
    emoji: text("emoji"),
    world: text("world").notNull().default("sunshine"),
    bigIdea: text("big_idea"),
    phonicsFocus: text("phonics_focus"),
    mathFocus: text("math_focus"),
    project: text("project"),
    checkpoint: text("checkpoint"), // baseline | mid | final | null
  },
  (t) => [uniqueIndex("unit_pv_key_uq").on(t.programVersionId, t.unitKey)],
);

export const lesson = pgTable(
  "lesson",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    unitId: text("unit_id").notNull().references(() => unit.id, { onDelete: "cascade" }),
    lessonKey: text("lesson_key").notNull(),
    orderKey: text("order_key").notNull(),
    title: text("title").notNull(),
  },
  (t) => [uniqueIndex("lesson_unit_key_uq").on(t.unitId, t.lessonKey)],
);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey().$defaultFn(uuid),
    lessonId: text("lesson_id").notNull().references(() => lesson.id, { onDelete: "cascade" }),
    activityKey: text("activity_key").notNull(), // stable; attempt.activityId references this
    orderKey: text("order_key").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    blurb: text("blurb"),
    estMinutes: integer("est_minutes"),
    band: text("band").notNull().default("ready"),
    skillTags: jsonb("skill_tags").$type<string[]>().notNull().default([]),
    standardTags: jsonb("standard_tags").$type<string[]>().notNull().default([]),
    config: jsonb("config").$type<unknown>().notNull(),
    // Pronunciation overrides live INLINE in config spoken strings as `[label](/IPA/)`
    // (see Coordination + [[kokoro-phoneme-overrides]]) — no separate column.
  },
  (t) => [uniqueIndex("activity_lesson_key_uq").on(t.lessonId, t.activityKey)],
);

/* ── Skill rubric (moved to DB; was static SKILLS) ──────────────────────────── */
export const skill = pgTable("skill", {
  id: text("id").primaryKey().$defaultFn(uuid),
  slug: text("slug").notNull().unique(), // "reading.comprehension.inference"
  domain: text("domain").notNull(),
  label: text("label").notNull(),
  readyIndicator: text("ready_indicator").notNull(),
  stretchIndicator: text("stretch_indicator"),
});
```

**Modify the existing `enrollment` table** (add three columns; keep the unique index):

```ts
// add to enrollment pgTable definition:
  programVersionId: text("program_version_id").references(() => programVersion.id, { onDelete: "set null" }), // pinned at assign
  // status already exists; widen accepted values to: active | paused | removed
  config: jsonb("config").$type<EnrollmentConfig>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
```

**Typed config shapes** (export from `src/lib/db/schema.ts` or a small `src/lib/content/config.ts`):

```ts
export interface EnrollmentConfig {
  band?: "ready" | "stretch";
  activeUnitKeys?: string[]; // omitted/undefined = all units active
  aiPractice?: boolean;      // overrides learner.settings.aiPractice for this program
  dailyGoal?: number;        // activities/day target
}
export interface LearnerSettings {
  dailyGoal?: number;
  aiPractice?: boolean;
  readAloud?: boolean;
}
```
Re-type `learner.settings` as `jsonb("settings").$type<LearnerSettings>()`.

**`REQUIRED_COLUMNS` additions** (`src/lib/db/health.ts`): `program{id,slug,status}`, `program_version{id,program_id,version,status,title}`, `unit{id,program_version_id,unit_key,order_key,title}`, `lesson{id,unit_id,lesson_key,order_key,title}`, `activity{id,lesson_id,activity_key,order_key,kind,title,config}`, `skill{id,slug,domain,label}`, `publisher{id,name,kind}`, `enrollment{config,status,program_version_id}`.

---

## File structure

| File | Responsibility | Slice |
| --- | --- | --- |
| `src/lib/db/schema.ts` (modify) | All content tables + enrollment columns + typed config | 1 |
| `src/lib/db/health.ts` (modify) | `REQUIRED_COLUMNS` for the new tables/columns | 1 |
| `src/lib/content/config.ts` (new) | `EnrollmentConfig`/`LearnerSettings` types + Zod schemas | 1/3 |
| `scripts/seed-content.ts` (new) | Seed builtin programs + skills from the static TS into DB | 1 |
| `src/lib/content/store.ts` (new) | Drizzle content CRUD + tree assembly + skills CRUD | 2/5 |
| `src/lib/content/repository.ts` (new) | Async `Program` resolvers; validate config; `cache()` | 2 |
| `src/content/index.ts` (modify) | Source getters → async (re-export repository); keep pure tree-walkers | 2 |
| `src/content/skills.ts` (modify) | Async skill access backed by DB; keep types | 2 |
| `src/app/(learner)/*` (modify) | Async content; drop `generateStaticParams`; read enrollment config | 2/3 |
| `src/app/(learner)/actions.ts` (modify) | Async content getters; config-aware enrollment reads | 2/3 |
| `src/app/(parent)/data.ts` (modify) | Async content; move module-level `ADAPTIVE_SKILL_TAGS` into request scope; enrolled-programs reads | 2/3 |
| `src/app/(parent)/actions.ts` (modify) | New enrollment/config/settings/export/delete actions | 3/6 |
| `src/lib/tutor/store.ts` (modify) | Enrollment lifecycle + config fns; export/delete helpers | 3/6 |
| `src/components/parent/DashboardShellParent.tsx` (modify) | Add "Curriculum" nav item | 4 |
| `src/components/parent/CurriculumPanel.tsx` (new) | Per-child enrolled programs + config controls (learner detail) | 3 |
| `src/components/parent/EnrollmentConfigForm.tsx` (new) | Band / active units / AI / daily goal controls | 3 |
| `src/components/parent/SettingsForm.tsx` (modify) | Persist via `saveLearnerSettingsAction` | 3 |
| `src/app/(parent)/parent/learners/[id]/page.tsx` (modify) | Mount Curriculum panel + export/delete | 3/6 |
| `src/app/(parent)/parent/curriculum/page.tsx` (new) | Marketplace catalog (cards) | 4 |
| `src/app/(parent)/parent/curriculum/[slug]/page.tsx` (new) | Program detail + assign-to-child | 4 |
| `src/components/parent/{MarketplaceGrid,ProgramCard,AssignProgramControl}.tsx` (new) | Catalog UI | 4 |
| `src/lib/admin.ts` (new) | `requireAdmin()` (env `ADMIN_EMAILS` allowlist over the session) | 5 |
| `src/app/(admin)/admin/*` (new) | Admin program list, draft editor, publish/archive | 5 |
| `src/app/(admin)/admin/actions.ts` (new) | Content mutations + draft→publish (clone) + archive | 5 |
| `src/components/admin/editor/*` (new) | RHF nested tree editor, dnd-kit reorder, Zod→fields renderer, comboboxes, pronunciation control | 5 |

---

## Slice 1 — Content schema, skills table, enrollment columns, seed

**Goal:** DB holds the seeded catalog + skills; enrollment has lifecycle/config columns; health canary green. App behavior **unchanged** (still reads static content) — this slice is pure foundation.

**Files:**
- Modify: `src/lib/db/schema.ts`, `src/lib/db/health.ts`
- Create: `src/lib/content/config.ts`, `scripts/seed-content.ts`
- Generate: `drizzle/<n>_curriculum.sql` (via `bun run db:generate`)
- Test: `src/lib/db/health.test.ts` (extend), `src/lib/content/config.test.ts`, `scripts/seed-content.test.ts`

**Interfaces produced (consumed by Slices 2–6):**
- Tables: `publisher, program, programVersion, unit, lesson, activity, skill` and the widened `enrollment` (from `@/lib/db/schema`).
- `EnrollmentConfig`, `LearnerSettings` + `enrollmentConfigSchema`, `learnerSettingsSchema` (Zod) from `@/lib/content/config`.
- `seedContent(): Promise<{ programs: number; skills: number }>` from `scripts/seed-content.ts` (idempotent; `onConflictDoNothing`).

- [ ] **Step 1: Write `config.ts` types + Zod (failing test first)**

```ts
// src/lib/content/config.test.ts
import { describe, expect, it } from "vitest";
import { enrollmentConfigSchema, learnerSettingsSchema } from "./config";

describe("enrollmentConfigSchema", () => {
  it("accepts a full config", () => {
    const r = enrollmentConfigSchema.parse({ band: "stretch", activeUnitKeys: ["reading"], aiPractice: false, dailyGoal: 3 });
    expect(r.activeUnitKeys).toEqual(["reading"]);
  });
  it("accepts an empty config (all-defaults)", () => {
    expect(enrollmentConfigSchema.parse({})).toEqual({});
  });
  it("rejects a bad band", () => {
    expect(() => enrollmentConfigSchema.parse({ band: "hard" })).toThrow();
  });
  it("rejects a negative daily goal", () => {
    expect(() => enrollmentConfigSchema.parse({ dailyGoal: -1 })).toThrow();
  });
});

describe("learnerSettingsSchema", () => {
  it("accepts known keys", () => {
    expect(learnerSettingsSchema.parse({ readAloud: true, aiPractice: true, dailyGoal: 2 }).readAloud).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify FAIL** — `bun run test src/lib/content/config.test.ts` → cannot find module `./config`.

- [ ] **Step 3: Implement `config.ts`**

```ts
// src/lib/content/config.ts
import { z } from "zod";

export const enrollmentConfigSchema = z.object({
  band: z.enum(["ready", "stretch"]).optional(),
  activeUnitKeys: z.array(z.string().min(1)).optional(),
  aiPractice: z.boolean().optional(),
  dailyGoal: z.number().int().min(0).max(50).optional(),
});
export type EnrollmentConfig = z.infer<typeof enrollmentConfigSchema>;

export const learnerSettingsSchema = z.object({
  dailyGoal: z.number().int().min(0).max(50).optional(),
  aiPractice: z.boolean().optional(),
  readAloud: z.boolean().optional(),
});
export type LearnerSettings = z.infer<typeof learnerSettingsSchema>;
```

- [ ] **Step 4: Run it, verify PASS** — `bun run test src/lib/content/config.test.ts`.

- [ ] **Step 5: Add the content tables + enrollment columns to `schema.ts`** — paste the "Shared schema" block above; import `integer` (already imported list includes most types — add `integer` if missing); import `EnrollmentConfig`, `LearnerSettings` from `@/lib/content/config`; re-type `learner.settings` and add the three `enrollment` columns. Commit nothing yet.

- [ ] **Step 6: Generate the migration** — `bun run db:generate`; confirm a new file appears under `drizzle/` creating all seven tables + the three `enrollment` columns. Inspect it.

- [ ] **Step 7: Extend `REQUIRED_COLUMNS` + its test** — add the columns listed in "Shared schema". Update `src/lib/db/health.test.ts` to assert the new tables/columns are present in `REQUIRED_COLUMNS`. Run `bun run test src/lib/db/health.test.ts` → PASS.

- [ ] **Step 8: Write the pure seed-transform test first** — split the seed into a **pure** `buildSeedPlan(programs, skills)` (NO DB) returning the row value-sets, and a thin `seedContent()` glue that inserts them. Test only the pure transform:

```ts
// scripts/seed-content.test.ts
import { describe, expect, it } from "vitest";
import { buildSeedPlan } from "./seed-content";
import { listPrograms, SKILLS } from "@/content";

describe("buildSeedPlan", () => {
  const plan = buildSeedPlan(listPrograms(), SKILLS);
  it("emits one program + one published v1 per static program", () => {
    expect(plan.programs.length).toBe(listPrograms().length);
    expect(plan.versions.every((v) => v.version === 1 && v.status === "published")).toBe(true);
  });
  it("preserves authored ids as stable keys (activityKey == authored activity.id)", () => {
    const a = listPrograms()[0].units[0].lessons[0].activities[0];
    expect(plan.activities.some((r) => r.activityKey === a.id)).toBe(true);
  });
  it("maps every skill", () => {
    expect(plan.skills.length).toBe(SKILLS.length);
  });
  it("orders siblings with lexically-sortable orderKeys matching authored order", () => {
    const u = plan.units.filter((r) => r.programVersionKey === plan.versions[0].key);
    const sorted = [...u].sort((x, y) => x.orderKey.localeCompare(y.orderKey));
    expect(sorted.map((r) => r.unitKey)).toEqual(u.map((r) => r.unitKey));
  });
});
```

- [ ] **Step 9: Run it (FAIL) → implement `buildSeedPlan` + `seedContent`.** `buildSeedPlan` is **pure**: for each `Program` emit `publisher`(builtin, deduped), `program`(slug, status=`published`), `program_version`(version 1, status=`published`, title/subtitle/ageBand/summary/world, `locale`, and `languages` — derive for `world-languages` from its units, else `["en-US"]`), then walk units→lessons→activities emitting rows keyed by the **authored ids** (`unitKey=unit.id`, `lessonKey=lesson.id`, `activityKey=activity.id`) with `orderKey = String(order).padStart(6,"0")` (simple/sortable; Slice 5 swaps in `fractional-indexing`). Use intra-plan `key` fields to wire parent↔child without DB ids (e.g. `programVersionKey`), resolved to real UUIDs in the glue. `seedContent()` is the thin glue: open `getDb()`, insert each set with `onConflictDoNothing`, set each `program.publishedVersionId`. **No DB in the test;** `seedContent()` is verified manually in Step 10. Run `bun run test scripts/seed-content.test.ts` → PASS.

- [ ] **Step 10: Run seed test → PASS**; then run the full gate `bun run lint && bun run typecheck && bun run test`. Apply the migration locally (`bun run db:migrate`) and run `bun scripts/seed-content.ts` against the dev DB; spot-check with `scripts/db.sh -c "select slug,status from program; select count(*) from activity; select count(*) from skill;"`.

- [ ] **Step 11: Hit `/api/health`** (dev) → expect `200 {status:"ok"}` (migration applied, no drift).

- [ ] **Step 12: Commit** — `git commit -m "feat(content): DB schema for versioned curriculum + skills + enrollment lifecycle/config + seed"`.

---

## Slice 2 — Async content repository + static→DB cutover

**Goal:** The app reads curriculum through one async seam that **prefers DB content and falls back to the static in-repo programs** when the DB is empty/unreachable (tests, `next build`, unseeded local) — so the suite stays green without a test DB and the static modules serve as both seed source and fallback. Learner routes go dynamic. No visible behavior change.

**Decisions (execution-time refinements):**
- (a) Only the **program** getters go async. **`SKILLS` stays static at runtime** (mastery/recommend/reports keep the synchronous rubric); the DB `skill` table feeds authoring + marketplace in Slices 4–5. This avoids an invasive async-skills cutover.
- (b) Split into **Task 2.1** (async content layer — new code, nothing calls it yet) + **Task 2.2** (cutover — rewire call sites, make learner routes dynamic).
- (c) **No import cycle:** `src/content/index.ts` stays static-only (raw `PROGRAMS` array + pure tree-walkers). `repository.ts` depends on `@/content` for the fallback; `index.ts` must NEVER import `repository.ts`.

**Files:** Create `src/lib/content/store.ts`, `src/lib/content/repository.ts`; modify `src/content/index.ts`, `src/content/skills.ts`, all `src/app/(learner)/*` pages + `actions.ts`, `src/app/(parent)/data.ts`, `src/app/(parent)/actions.ts`, `src/lib/ai/practice.ts` (skill-rubric reads only — **not** the TTS calls). Tests colocated.

**Interfaces produced:**
- `src/lib/content/store.ts`: `getPublishedProgramRows(slug)`, `getProgramVersionRows(versionId)`, `listPublishedProgramSummaries()`, `getAllSkills()` — raw row reads.
- `src/lib/content/repository.ts` (the runtime seam):
  - `getProgramAsync(slug: string): Promise<Program | undefined>` — published version, assembled + config-validated.
  - `getProgramVersionAsync(versionId: string): Promise<Program | undefined>` — a specific (pinned) version.
  - `listProgramsAsync(): Promise<ProgramSummary[]>` — light catalog metadata (no full tree).
  - `findProgramByActivityIdAsync(activityId): Promise<Program | undefined>`.
  - `getSkillsAsync(): Promise<Skill[]>`, `getSkillAsync(slug): Promise<Skill | undefined>`.
  - Each wrapped in React `cache()` for per-request dedupe. (Cross-request `unstable_cache`/tags deferred — see caching note.)
- `src/content/index.ts` keeps the **pure** tree-walkers unchanged (`getUnit`, `getLesson`, `findActivity`, `programStats`, `activityIdsForProgram`, `skillTagsForProgram`) — they operate on a resolved `Program`. The **synchronous** source getters (`getProgram`, `listPrograms`, `findProgramByActivityId`, `getSkill`, `SKILLS`) are removed/replaced by the async repository; every call site updates.

**Consumes:** Slice 1 tables.

**Caching note (decision: ship simple):** Use React `cache()` only for now (per-request dedupe). Do **not** enable Next 16 `cacheComponents`/`use cache` or a Redis cache-handler this slice — single-replica pilot makes the multi-pod-cache correctness issue moot, and `cacheComponents` is a project-wide posture change with a known `notFound()`+`cookies()` caveat. Revisit cross-request caching + Redis handler at real multi-replica scale (separate plan).

**Tasks (expanded to bite-sized TDD at execution):**
- [ ] `store.ts`: assemble rows → ordered tree (order by `orderKey`); test against the seeded DB that a known program returns the expected unit/lesson/activity counts and keys.
- [ ] `repository.ts`: `getProgramAsync` maps rows → the existing `Program` type and runs `ACTIVITY_CONFIG_SCHEMAS[kind].parse(config)` per activity; test it returns a `Program` deep-equal (by id/title/structure) to the static `kaelynAdaptive` for the seeded data. Invalid config → activity dropped + `captureNonCritical` (never throw to a learner).
- [ ] Skills → DB: `getSkillsAsync`/`getSkillAsync`; update `src/content/skills.ts` consumers. Mastery engine untouched (it takes resolved skills/state).
- [ ] Convert `src/content/index.ts` source getters to async re-exports; fix every call site (compile-driven). Key sites: `(learner)/actions.ts` (`ensureEnrollmentAction` slug validation, `getLearnerStateAction` scoping), `(parent)/data.ts` (replace module-level `ADAPTIVE_SKILL_TAGS` with a per-request `await getAdaptiveSkillTags()`), `(parent)/actions.ts` (report grounding), learner pages.
- [ ] Learner routes: delete content-enumerating `generateStaticParams`; resolve program/version in the dynamic page; render via async repository. Verify pages render from DB.
- [ ] Gate + commit per task.

---

## Slice 3 — Enrollment lifecycle + per-child config + kid wiring + settings persistence

**Goal:** Parents assign/remove (soft) programs per child and configure them; the kid surface honors config; the Settings form persists.

**Files:** Modify `src/lib/tutor/store.ts`, `src/app/(parent)/actions.ts`, `src/app/(parent)/data.ts`, `src/app/(learner)/actions.ts`, learner StudioHome reads, `src/app/api/practice/route.ts` (AI gate), `src/components/parent/SettingsForm.tsx`, `src/app/(parent)/parent/learners/[id]/page.tsx`; create `src/components/parent/CurriculumPanel.tsx`, `src/components/parent/EnrollmentConfigForm.tsx`.

**Interfaces produced:**
- `store.ts`: `assignProgram(learnerId, slug, versionId)`, `setEnrollmentStatus(learnerId, slug, status)`, `setEnrollmentConfig(learnerId, slug, config)`, `listEnrollmentsDetailed(accountId, learnerId): Promise<EnrollmentDetail[]>` (slug, status, config, pinned version, program summary), `saveLearnerSettings(accountId, learnerId, settings)`.
- `(parent)/actions.ts`: `assignProgramAction`, `removeProgramAction` (status→removed, soft), `restoreProgramAction`, `updateEnrollmentConfigAction`, `saveLearnerSettingsAction` — all discriminated results, `revalidatePath`.
- Kid surface: `getEnrollmentsAction` returns config + pinned version; `getLearnerStateAction` filters units by `config.activeUnitKeys`, seeds `config.band`, and the practice button + `/api/practice` check `aiPractice` (enrollment config overriding `learner.settings`).

**Consumes:** Slices 1–2.

**Requirement coverage:** soft-remove lifecycle; band/active-units/AI/daily-goal config; settings persistence; per-child curriculum overview (learner detail).

**Tasks:** lifecycle store fns + transitions guard (`active|paused|removed`); EnrollmentConfig validation; CurriculumPanel (enrolled list + per-program EnrollmentConfigForm + remove/restore); kid-surface honoring (unit filter, band seed, AI gate, daily-goal meter display); SettingsForm → `saveLearnerSettingsAction`. TDD per fn; gate + commit per task.

---

## Slice 4 — Marketplace catalog UI (parent)

**Goal:** A browsable catalog of published programs + a program detail page with assign-to-child.

**Files:** Create `src/app/(parent)/parent/curriculum/page.tsx`, `src/app/(parent)/parent/curriculum/[slug]/page.tsx`, `src/components/parent/{MarketplaceGrid,ProgramCard,AssignProgramControl}.tsx`; modify `src/components/parent/DashboardShellParent.tsx` (add `{ href: "/parent/curriculum", label: "Curriculum", icon: BooksIcon }` to `NAV`).

**Interfaces consumed:** `listProgramsAsync` (Slice 2), `assignProgramAction` (Slice 3), `listLearnerCards` (existing).

**Requirement coverage:** global catalog browse; assign from marketplace (program-centric → pick child).

**Tasks:** catalog grid of bespoke cards (title/subtitle/ageBand/languages/stats, sorted/filtered with plain array methods — no TanStack Table); program detail (units overview, skills touched, languages, age band) + `AssignProgramControl` (child multiselect → `assignProgramAction`, pins current published version). TDD on the data shaping; component render tests; gate + commit.

---

## Slice 5 — Admin authoring studio (custom nested editor + versioning/publish)

**Goal:** An admin can create, edit, reorder, and publish curriculum; editing a published program clones a new draft version. Pronunciation/multi-lingual authoring included (pronunciation widget gated on TTS coordination).

**Files:** Create `src/lib/admin.ts`; `src/app/(admin)/admin/{page,programs/[id]/page}.tsx` + `layout.tsx` (admin gate); `src/app/(admin)/admin/actions.ts`; `src/components/admin/editor/*` (`ProgramEditor`, `UnitList`, `LessonList`, `ActivityList`, `SortableRow`, `ConfigFields` (Zod→fields), `SkillTagCombobox`, `LanguageSelect`, `PronunciationControl`); extend `src/lib/content/store.ts` with mutations. Install the Slice-5 deps.

**Interfaces produced:**
- `requireAdmin(): Promise<{ userId; email }>` — throws `UnauthorizedError` unless `email ∈ ADMIN_EMAILS` (env allowlist; no role table needed).
- `store.ts` mutations: `createProgramDraft(input)`, `upsertVersionTree(versionId, tree)`, `reorderEntity(table, id, beforeKey, afterKey)` (fractional-indexing `generateKeyBetween`), `publishVersion(versionId)` (set version status=published, program.status=published, program.publishedVersionId; demote prior), `archiveProgram(programId)`, `cloneVersionToDraft(versionId)`.
- `admin/actions.ts`: server actions wrapping the above behind `requireAdmin()`, Zod-validating each activity `config` via `ACTIVITY_CONFIG_SCHEMAS[kind]`.

**Editor design:** one RHF `useForm` over the whole tree; `useFieldArray` per level; dnd-kit `SortableContext` per list calling `useFieldArray.move()` + persisting the moved row's `orderKey`; `ConfigFields` dispatches on `kind` to a ~150-line Zod-node→Wonder-Studio-input renderer reusing `ACTIVITY_CONFIG_SCHEMAS` (incl. `.refine()` on submit); `SkillTagCombobox`/`LanguageSelect` via Radix Popover + cmdk styled with our tokens; **`PronunciationControl`** inserts inline `[label](/IPA/)` overrides into the activity's spoken `config` strings and previews via `POST /api/tts` (read-only; see `[[kokoro-phoneme-overrides]]`).

**Consumes:** Slices 1–2; library deps.

**Requirement coverage:** full nested form editor; draft/publish/archive + versioning; publisher model; multi-lingual + pronunciation authoring.

**Tasks (gated):** admin gate; program list; create-draft; the tree editor (built bottom-up: `ConfigFields` renderer → ActivityList → LessonList → UnitList → ProgramEditor); dnd reorder + orderKey persistence; publish/clone/archive actions; `LanguageSelect`/`SkillTagCombobox`; **`PronunciationControl` LAST, after confirming the TTS phoneme field shape** (see Coordination). TDD on store mutations + the Zod→fields renderer (pure); component tests; gate + commit per task.

---

## Slice 6 — Per-child data export + profile delete

**Goal:** Wire the disabled P4 stubs: export a child's full data as JSON; delete a child profile (cascade).

**Files:** Modify `src/lib/tutor/store.ts` (`buildLearnerExport(accountId, learnerId)`, `deleteLearner(accountId, learnerId)`), `src/app/(parent)/actions.ts` (`exportLearnerAction`, `deleteLearnerAction` — confirm flow), `src/app/(parent)/parent/learners/[id]/page.tsx` + the Settings surface (enable the buttons).

**Interfaces:** `buildLearnerExport` assembles learner + enrollments(+config) + attempts + skill_state into a plain object → `Response.json` (native; no lib). `deleteLearner` relies on existing FK cascades (enrollment/attempt/skill_state cascade on learner delete); scoped via `withAccount`.

**Requirement coverage:** data export/delete (COPPA-minded, spec §8).

**Tasks:** export shape test; delete cascade test; confirm UI (Radix Dialog from Slice 5 deps, or a bespoke confirm); gate + commit.

---

## Self-review — requirement coverage

| Confirmed requirement (2026-06-21 session) | Slice(s) |
| --- | --- |
| DB-backed content (normalized, versioned, publisher) | 1, 2, 5 |
| Skills moved to a DB table | 1, 2 |
| Async content seam; static→DB cutover; SSG→dynamic | 2 |
| Per-child config: band default | 3 |
| Per-child config: active units/strands | 1 (`unitKey`), 3 |
| Per-child config: AI practice on/off | 3 |
| Per-child config: daily goal/time | 3 |
| Soft-remove enrollment (status lifecycle, keep progress) | 1 (cols), 3 |
| Version pinning per enrollment | 1, 3, 5 |
| Marketplace browse — global catalog | 4 |
| Manage curriculum — per-child panel | 3 |
| Admin authoring — full nested form editor | 5 |
| Draft / publish / archive lifecycle | 5 |
| Persist parent/child settings | 3 |
| Per-child curriculum overview on home + learner detail | 3 (+ home read in 3) |
| Data export / profile delete | 6 |
| Multi-lingual first-class | 1 (`locale`/`languages`), 4, 5 |
| Pronunciation/phoneme authoring (inline `[label](/IPA/)`, no column) | 5 (widget) |

**Coordination item (resolved):** the TTS phoneme format is inline `[label](/IPA/)` (see `[[kokoro-phoneme-overrides]]`); the `PronunciationControl` widget (Slice 5) authors these inline overrides and consumes `/dev/phonemize` + `/api/tts` read-only. No schema column needed.
