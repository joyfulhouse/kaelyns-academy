# Adventure 2.0 Phase B — Slice B1: Life Skills Math

**Date:** 2026-07-02
**Status:** Design presented; awaiting user spec review (defaults applied while user away)
**Parent design:** `docs/superpowers/specs/2026-07-01-adventure-2-design.md` (§8 activity plugins, §9 curriculum)
**Predecessor slice:** Phase A (choice & motivation) — shipped, live.

## 1. Context & Decomposition

Phase B of Adventure 2.0 is "stronger curriculum": 6 new activity plugins + a
grade-1 content ramp + 4 new subjects. That is too large and too heterogeneous
for one spec, so Phase B is decomposed into **vertical subject slices** — each
slice ships a complete new playable subject (its plugins + content + seed
together), so the learner feels a whole new world each ship and plugins are
built exactly when their first content needs them (no orphan plugins).

**B1 = Life Skills Math**, chosen first: highest real-world payoff for a
1st-grader, the densest-plugin subject (3 of the 6 new kinds), concrete and
assessable, no AI-generation subtlety — the right subject to prove the
plugin → content → seed → deploy loop on before scaling to Science, Art, etc.

## 2. Goal

Ship a "Life Skills Math" world where the pilot learner learns to **tell time,
count money, and measure** — three new activity-type plugins plus an authored,
parent-reviewed content unit, integrated into the existing `kaelyn-adaptive`
program and its adaptive recommender / mastery / reward systems with no changes
to those systems.

## 3. The Three Plugins

Each is a self-contained module under `src/activities/<kind>/` following the
existing contract exactly (same shape as `math-tenframe`):

- `index.ts` — wires the `ActivityType<Config, Response>` (kind, label, schema,
  Player, score, skillsAffected).
- `logic.ts` — server-safe (no `"use client"`): re-exports the zod `schema`
  from `@/content/activity-configs`, plus pure `score()` and `skillsAffected()`,
  reusing `_shared/scoring.ts` (`evenSkillEvidence`, `outcomeFromAccuracy`,
  `starsFromAccuracy`).
- `Player.tsx` — the client interaction.
- `logic.test.ts` — pure tests for every mode's `score`/`skillsAffected`.

Each config is a **discriminated union on `mode`** (mirroring tenframe's
`represent | add`), so a config is type-checked at authoring time and validated
before render. Two modes per plugin:

| Kind | `mode` | Interaction | Config essentials | Standard |
|---|---|---|---|---|
| **`math-clock`** | `read` | Show an analog clock; child taps the matching digital time from 3–4 choices. | `{ mode:"read", hour:0-12, minute:0\|30, choices:[hh:mm], answerIndex }` | CCSS.1.MD.B.3 |
| | `set` | Child drags the hour hand (snap to hour/half-hour positions) to make a stated time. | `{ mode:"set", targetHour:0-12, targetMinute:0\|30, instruction }` | |
| **`math-money`** | `identify` | Child taps the named coin among a set. | `{ mode:"identify", coins:[penny\|nickel\|dime\|quarter], targetCoin, instruction }` | CCSS.1.MD (money) |
| | `count` | Child taps coins from a palette into a tray until it reaches a target amount (active placement, like tenframe dots). | `{ mode:"count", coins:[…palette], targetCents:1-100, instruction }` | |
| **`math-measure`** | `compare` | "Which is longer/shorter/taller/heavier?" — child taps the answer. | `{ mode:"compare", attribute:"length"\|"height"\|"weight", items:[{label,emoji,size}], answerIndex, instruction }` | CCSS.1.MD.A.1 |
| | `units` | "How many cubes/paperclips long?" — child taps the count. | `{ mode:"units", unit:"cube"\|"paperclip"\|…, length:1-12, choices:[int], answerIndex, instruction }` | CCSS.1.MD.A.2 |

**Interaction rules (all three):** big tappable targets (≥44px, `min-h-11`),
Wonder Studio static class maps, Phosphor icons only, TTS-narrated instructions
via the existing `readAloud` seam. **Forgiving scoring:** an activity always
finishes with ≥1 star; first-try accuracy maps to stars/outcome through the
shared helpers (same posture as every existing plugin — a wrong tap re-prompts,
never fails). No timers.

**Response shapes** are per-plugin (the child's taps/placements + attempt
count), scored purely in `logic.ts`. `skillsAffected` returns the new skill tags
(§5) per mode.

## 4. Content — a New Unit in `kaelyn-adaptive`

A **"Life Skills Math"** unit authored as static TS appended to
`src/content/programs/kaelyn-adaptive.ts` (the existing source the DB content
repository seeds from), rendered as its own **map world** using the existing
`garden` world theme (no new Wonder Studio tokens).

- **3 lessons:** Telling Time · Money & Coins · Measuring.
- **~3–4 activities per lesson** (~10–12 authored activities total) using the
  three new plugins, plus optionally one cross-subject tie-in per lesson
  (a short `reading-comprehension` or `journal-prompt` about time/money/measuring)
  for texture — reusing existing kinds, no new work.
- Content is **authored by Claude, parent-reviewed before seeding** (spec §9).
- Pronunciation overrides (`[label](/IPA/)`) on any new spoken vocabulary the
  default G2P mis-voices (e.g. coin names), per the Kokoro override convention.
- No `generateStaticParams` change — learner routes are already dynamic.

## 5. Skills & Parent Reporting

Three new skill tags added to `src/content/skills.ts` (each a `Skill` with
`readyIndicator`/`stretchIndicator`), carried in the new activities' `skillTags`:

- `math.time` — tell time to the hour and half-hour.
- `math.money` — identify coins and count money to a total.
- `math.measure` — compare and measure length/height/weight.

**New `SkillDomain` `"lifeskills"`** added to the union in
`src/content/types.ts`, so the parent report shows a distinct **"Life Skills
Math"** progress row. (Decision, user-collapsible: if a separate row is
unwanted, tag these under the existing `"math"` domain instead — a one-line
change with no other impact. Default here is the distinct domain for clearer
subject storytelling.)

The mastery engine, next-best recommender, quest system, and star economy
consume skill tags + units generically, so they need **no changes** — the new
unit rotates into the recommender's breadth ordering and the new skills flow
into `skill_state` automatically.

## 6. Integration Points

- **`src/content/activity-configs.ts`:** add the three zod config schemas +
  their `*Config` types; add the three kinds to `ACTIVITY_CONFIG_SCHEMAS`.
- **`src/content/types.ts`:** extend the `ActivityKind` union (via the
  `activity-configs` kinds) and the `Activity` discriminated union with the
  three new `ActivityOf<kind, Config>` members; add `"lifeskills"` to
  `SkillDomain`.
- **`src/content/registry.ts` + `src/activities/index.ts`:** register the three
  new `ActivityType`s (side-effect registration, same as the existing 8).
- **`scripts/seed-content.ts`:** no code change — the new unit + skills are part
  of `kaelyn-adaptive` / `SKILLS`, which the seed already walks. Re-running the
  seed publishes them.
- **No DB migration:** `skill.domain` and `activity.kind` are text columns; the
  new domain/kinds are data, not schema.

## 7. Deploy & CI (lesson carried from Phase A)

The homelab Forgejo pre-deploy E2E gate seeds `scripts/seed-content.ts`, and
this content IS part of `seed-content` (the `kaelyn-adaptive` program) — so
**no CI-gate change is required** (unlike Phase A's separate `seed-motivation`,
whose omission from the gate silently blocked that deploy). If B1 adds an e2e
spec asserting the new world, it will already have the data because the gate
seeds curriculum. Prod picks it up on the normal GitOps roll; migration count
is unchanged.

## 8. Testing

- **Per-plugin `logic.test.ts`:** every mode's `score()` (correct/incorrect,
  first-try vs retried → star/outcome mapping) and `skillsAffected()`.
- **Content validation:** the existing `src/content/validate.ts` test asserts
  every activity's `kind` is registered and every `skillTag` exists in `SKILLS`;
  the new unit must pass unchanged. Add a focused test that the new unit's
  activities reference only registered kinds + the three new skills.
- **Optional e2e smoke:** the "Life Skills Math" world renders on the map and
  one activity of each new kind loads (prod-gated, seeded via the content seed).
- Full gate before merge: `bun run lint && bun run typecheck && bun run test &&
  bun run build`.

## 9. Non-Goals (this slice)

- No AI "more, made just for me" generation for the new kinds (authored-only;
  KIND_BRIEF + generation schemas are a clean fast-follow once the plugins prove
  out).
- No interest theming of the authored content (that is an AI-layer feature).
- No assessment / placement / `checkpoint_result` (Phase C).
- No other subjects (Science, Social Studies, Art & Music) or grade-1 ramp of
  the existing strands — later Phase B slices.
- No branching within the new unit (a later content refinement).

## 10. Decision Log

| Decision | Choice | Alternatives |
|---|---|---|
| Phase B slicing | Vertical subject slices | Plugins-first; interaction-family slices |
| First slice | Life Skills Math | Science; grade-1 ramp; Art & Music |
| AI practice for new kinds | Authored-only v1 (fast-follow later) | AI-generable from the start |
| Skill domain | New `"lifeskills"` domain (collapsible to `math`) | Fold into `math` |
| Plugin config shape | Discriminated union on `mode`, 2 modes each | Separate kinds per mode |
| World theme | Reuse `garden` | New Wonder Studio world token |
| Content home | New unit in `kaelyn-adaptive` | New standalone program |
