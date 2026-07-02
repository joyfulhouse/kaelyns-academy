# Adventure 2.0 — Choice, Motivation, Curriculum Depth & Platform Completion

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan
**Predecessors:** `docs/specs/2026-06-13-platform-v3-design.md` (v3 platform),
`docs/superpowers/plans/2026-06-21-curriculum-marketplace.md` (versioned curriculum, shipped)

## 1. Context & Goals

The v3 platform is feature-complete through P5 (learner surface, parent dashboard,
admin authoring studio, versioned curriculum marketplace, AI tutor/practice, TTS,
PWA, COPPA export/delete). The remaining gaps, confirmed by a full codebase audit:

1. **Learner choice is essentially absent.** The path is guided/linear; the only
   child agency is picking an unlocked world and tapping "more practice."
   `dailyGoal` is a display-only pill; `activeUnitKeys` is parent curation.
2. **Curriculum breadth is thin.** Only `kaelyn-adaptive` and `world-languages`
   are served; several strands lean on the same few of the 8 activity kinds.
3. **Assessment is half-done.** `unit.checkpoint` is a badge; the spec's
   baseline/mid/final `checkpoint_result` capture was never built.
4. **P6 feedback loop unbuilt.** No `work_items`/`sprints` tables, no in-app
   feedback widget; the sprint skills are inert.

**Goal:** give the pilot learner (entering 1st grade, fall 2026) real agency and
motivation in her learning adventure, a substantially deeper and broader
curriculum, automatic measurement of her level, and close out the platform's P6
loop — in that order (experience-first).

## 2. Scope: Four Phases, One Spec

| Phase | Contents |
|---|---|
| **A — Choice & motivation** | Star economy, sticker book + shop, quest board, interest system, branching map |
| **B — Curriculum expansion** | 6 new activity plugins, grade-1 ramp in existing strands, 4 new strands |
| **C — Assessment & placement** | Baseline/mid/final check-ins, `checkpoint_result`, placement engine → parent-confirmed band changes |
| **D — Platform completion** | `work_items`/`sprints` + feedback widget, per-household AI cost accounting, browser Sentry DSN |

Architecture decision (user-selected): **DB-first** — motivation and choice
systems are fully normalized, admin-authorable Postgres tables, consistent with
the marketplace direction. One approved deviation: motivation content uses a
`draft/published/archived` **status lifecycle, not immutable version-cloning** —
nothing pins to motivation versions the way enrollments pin curriculum versions,
so version clones would be ceremony without a consumer.

## 3. Data Model (Phase A + C tables)

All tables follow existing Drizzle/naming conventions in `src/lib/db/schema.ts`;
migrations generated via `bun run db:generate`.

### 3.1 Star economy

- **`star_ledger`** — append-only: `id`, `learner_id` (FK), `delta` (int, +/-),
  `reason` enum (`activity_complete | quest_complete | checkpoint |
  sticker_purchase | adjustment`), `ref_id` (nullable, polymorphic reference to
  the activity/quest/sticker involved), `created_at`. Balance is
  `sum(delta)` — no mutable counter to corrupt. `recordAttemptAction` writes
  earn events using the existing forgiving star scoring; spends are written by
  the sticker-shop action inside the same transaction that grants the sticker
  (balance check + insert are atomic; balance can never go negative).

### 3.2 Sticker book

- **`sticker_pack`** — `id`, `slug`, `title`, `theme`, `status`
  (`draft | published | archived`), `sort_key`.
- **`sticker`** — `id`, `pack_id` (FK), `slug`, `title`, `art_ref` (path into
  the in-repo static asset gallery), `star_cost`, `sort_key`.
- **`learner_sticker`** — `learner_id`, `sticker_id`, `acquired_at`
  (unique on the pair).

Sticker art ships as static assets in-repo; the DB stores references. No blind
packs, no randomness, no scarcity timers — she sees prices and picks exactly the
sticker she wants.

### 3.3 Interests

- **`interest`** — `id`, `slug`, `label`, `icon`, `status`. Admin-authored
  preset taxonomy.
- **`learner_interest`** — `learner_id`, `interest_id`, `source`
  (`child | parent`), `created_at`. Child selections come only from the
  parent-enabled subset; bounded vocabulary, no free text (§8-safe).

### 3.4 Quests

- **`quest_template`** — `id`, `slug`, `title`, `kind`
  (`complete_n | try_strand | practice_skill | reach_checkpoint`), `params`
  (jsonb, validated server-side against a per-kind schema, same pattern as
  `ACTIVITY_CONFIG_SCHEMAS`), `reward_stars`, `status`.
- **`learner_quest`** — `id`, `learner_id`, `template_id`, `assigned_on`
  (date), `progress` (jsonb), `status` (`offered | active | done | expired`).
  The daily board offers three; she activates one at a time; expiry is silent
  and penalty-free at day rollover.

### 3.5 Assessment (Phase C)

- **`checkpoint_result`** — `id`, `learner_id`, `enrollment_id`, `unit_id`,
  `phase` (`baseline | mid | final`), `scores` (jsonb: per-skill-slug numeric
  scores), `created_at`. Matches the v3 spec's original design.

### 3.6 Content-schema addition

- **`unit.branch_key`** (nullable text) — units sharing an unlock parent but
  different `branch_key` render as forking map paths. One migration; a small
  field in the admin tree editor. Curriculum versioning untouched — branches
  are unit metadata inside a version.

### 3.7 Guest mode & privacy

- **Guest mode:** economy/quests/interests require an account. Guest learners
  keep today's local stars-only experience. No localStorage mirror of the
  ledger/catalog system.
- **COPPA:** every new learner-state table (`star_ledger`, `learner_sticker`,
  `learner_interest`, `learner_quest`, `checkpoint_result`) is added to the
  existing export and delete flows **in the same PR that creates it**.

## 4. Learner Experience (Phase A)

Wonder Studio styling throughout: static class maps, Phosphor icons, TTS
narration with `[label](/IPA/)` pronunciation overrides on new spoken strings.

### 4.1 Quest board — "Today's Adventures"

Replaces the single "Your next thing" card on the World Map. The recommender's
`nextBest` generalizes to a ranked top-3 menu; each option is wrapped in a quest
instantiated from the template pool. She taps one to activate it; progress fills
as she completes matching activities; completion triggers a star burst and a
`quest_complete` ledger credit. `dailyGoal` becomes the board's completion
target instead of a display-only pill. Forgiving posture unchanged: nothing is
locked behind quests; the map remains directly playable and ignoring quests has
no penalty.

### 4.2 Sticker book & shop

New learner destination (`/learn/[programSlug]/stickers`) plus a persistent
star-balance chip on the map. Book: one page per published pack; owned stickers
full-color, unowned as silhouettes. Shop: spend stars on the exact sticker she
picks. Placement on the page is automatic in v1 (drag-to-place is a
fast-follow).

### 4.3 Interest picker

First-run and re-editable from her profile corner: pick up to five interest chips
from the parent-enabled set — big icons, TTS-narrated labels. Interests theme
(a) AI practice generation ("more, made just for me" story problems), (b)
journal prompts, (c) quest copy. Static curriculum content is **not** rewritten
per-interest — theming is presentation- and AI-layer only, so versioned content
stays stable.

### 4.4 Branching map

Forking paths render at `branch_key` boundaries with a "choose your path"
moment. Branches reconverge at checkpoints so no content is ever unreachable;
the non-chosen branch stays visible and playable (choice, not lockout).

## 5. Parent Surface (Phase A + C)

- Learner settings gains **Interests** (enable/disable which preset chips her
  picker offers) and **Rewards** (star balance + ledger history, one-tap
  "grant bonus stars" for offline wins → `adjustment` ledger entry).
- Activity trail and the AI progress report incorporate quests completed and
  checkpoint results.
- Phase C placement suggestions surface on the learner detail page with an
  explicit "apply band change" confirmation. Auto-apply is a later opt-in.

## 6. Admin Studio (Phase A)

Three new sections alongside Programs, all behind the existing server-side
`role` gate and `withAdminAction` pattern:

- **Stickers** — pack + sticker CRUD; art chosen from the in-repo asset gallery.
- **Quests** — template CRUD with per-kind config forms (reusing the
  `ConfigEditor` pattern).
- **Interests** — flat taxonomy CRUD.

## 7. AI Boundary (§8, unchanged posture)

Interests enter prompts as server-side enum slugs only. The practice API's
server-enforced two-control gate and schema validation are unchanged. All AI
calls remain behind the LiteLLM wrapper (`src/lib/ai/models.ts`). No open-ended
child↔LLM chat anywhere in this design.

## 8. New Activity Plugins (Phase B)

Six new kinds, each a self-contained module under `src/activities/<kind>/`
following the existing `schema / Player / score / skillsAffected` contract:

| Kind | Interaction | Serves |
|---|---|---|
| `math-clock` | Set/read analog + digital time | Life Skills Math |
| `math-money` | Count coins, make amounts | Life Skills Math |
| `math-measure` | Compare/measure length & weight | Life Skills Math, Science |
| `seq-order` | Drag cards into correct sequence | Story retelling, life cycles |
| `sort-categories` | Drag items into labeled bins | Science, Social Studies, grammar |
| `art-studio` | Pattern/color/draw-along; gallery-saved; unscored | Art & Music (completion stars only) |

Music listening reuses `lang-listen-match` with sound clips. Six plugins is the
scoped capacity for this phase; further kinds follow once these prove out.

## 9. Curriculum Content (Phase B)

Authored via the existing pipeline: `docs/curriculum/` docs → static TS in
`src/content/programs/` → `scripts/seed-content.ts` → DB. Content written by
Claude, reviewed by the parent before seeding. Pronunciation overrides on new
spoken vocabulary; branch points where strands offer path choices.

- **Grade-1 ramp** in the four existing `kaelyn-adaptive` strands: place value
  to 120, addition/subtraction fluency within 20, longer reading-comprehension
  passages, opinion/narrative writing.
- **Four new strands:** Science & Nature, Community & World (social
  studies/geography), Life Skills Math, Art & Music.

## 10. Assessment & Placement (Phase C)

- Each strand gets a short, game-framed **baseline check-in** ("show what you
  know" — no fail states), plus mid and final checkpoints at branch
  reconvergence points.
- Results write per-skill scores to `checkpoint_result`.
- A placement engine maps results to band suggestions surfaced on the parent
  dashboard; parent confirms before any band change applies.
- The recommender consumes checkpoint data to weight its quest menu.

## 11. Platform Completion (Phase D)

- **`work_items` + `sprints` tables and the in-app feedback widget** — closes
  P6 and un-inerts the `/sprint`, `/sprint-plan`, `/work-item` skills.
- **Per-household AI usage/cost accounting** on the LiteLLM wrapper (spec §6
  gap).
- **Browser Sentry DSN wiring** (one-time Forgejo Actions secret).
- **Explicitly deferred:** Redis cluster-wide rate limiting (until
  multi-replica pressure is real); admin email verification (blocked on an
  email transport decision — out of scope here).

## 12. Testing & Delivery

- **Vitest:** ledger math + atomic spend, quest progress transitions, placement
  engine, and each new plugin's `logic.ts`.
- **E2E (Playwright):** quest-board and sticker-shop journeys added to the
  existing prod-gated suite.
- **Delivery:** each phase = one or more PRs through the merge-ready gate →
  GitOps deploy → canary, per existing workflow. Every learner-state table
  lands with export/delete coverage in the same PR. Migrations auto-run via the
  Deployment migrate initContainer.

## 13. Non-Goals

- No blind packs, loot boxes, streak pressure, or scarcity mechanics — ever.
- No per-interest rewriting of versioned curriculum content.
- No open-ended child↔LLM chat (§8).
- No guest-mode economy mirror.
- No auto-applied band changes in v1 (parent confirms).
- No new locales for motivation-content UI (English v1; schema doesn't preclude
  later localization).

## 14. Decision Log

| Decision | Choice | Alternatives considered |
|---|---|---|
| Sequencing | Experience-first phased (A→B→C→D), one spec | Content-first; separate spec cycles |
| Architecture | DB-first, fully normalized + admin-authorable | Lightweight config layer; hybrid |
| Motivation content lifecycle | Status lifecycle (draft/published/archived) | Immutable version-cloning (rejected: no consumer pins motivation versions) |
| Reward metaphor | Sticker book | Companion pet; Wonder Garden; avatar dress-up |
| New subjects | Science & Nature, Social Studies & Geo, Life Skills Math, Art & Music | (all selected) |
| Interest input | Child picks from parent-enabled presets | Parent-only; free text (rejected: §8) |
| Guest mode | Account required for economy/quests/interests | localStorage mirror (rejected: complexity) |
