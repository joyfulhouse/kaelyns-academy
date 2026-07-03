# Adventure 2.0 Phase B — Slice B2: Science & Nature

**Date:** 2026-07-02
**Status:** Design presented + approved; awaiting user spec review
**Parent design:** `docs/superpowers/specs/2026-07-01-adventure-2-design.md` (§8 activity plugins, §9 curriculum)
**Predecessor slices:** B1 Life Skills Math (`docs/superpowers/specs/2026-07-02-adventure-2-b1-life-skills-math-design.md`) — shipped, live. B2 follows the exact B1 pattern.

## 1. Context

Phase B ships "stronger curriculum" as **vertical subject slices** — each slice a
complete new playable subject (its plugins + content + seed together). B1 (Life
Skills Math: clock/money/measure) is live and established the whole pipeline:
plugin contract, discriminated/single config schemas, forgiving scoring via
`_shared/scoring.ts`, a new per-subject `SkillDomain`, DB-preferred content, and
the **required prod `seed-content.ts` re-run** (learned the hard way in B1 — the
new curriculum did not appear on prod until the prod DB was re-seeded).

**B2 = Science & Nature**, the second slice. It introduces the first
**tap-to-place** interaction on the kid surface (B1's plugins were all tap-a-
choice / tap-to-set), used by two new plugins that also serve later subjects
(Social Studies, grammar, story retelling).

## 2. Goal

Ship a "Science & Nature" world where the pilot learner practices **sorting &
classifying**, **sequencing (life cycles & events)**, and **observation** — two
new activity-type plugins plus an authored, parent-reviewed content unit,
integrated into `kaelyn-adaptive` and its adaptive/reward systems with no changes
to those systems.

## 3. The Two Plugins

Each is a self-contained module under `src/activities/<kind>/` following the
existing contract exactly (same shape as B1's `math-money`): `index.ts` (wires
the `ActivityType`), server-safe `logic.ts` (re-exports the zod `schema` + pure
`isCorrect`/`score`/`skillsAffected`, reusing `_shared/scoring.ts` incl.
`firstTryRateFromAttempts`), `Player.tsx` (client), `logic.test.ts`.

Both are **single-interaction** (no `mode` discriminator — simpler than B1's
two-mode plugins) and **tap-to-place** (no drag library; the same reliability
rationale that made B1 choose tap-to-set for the clock — drag is fiddly for a
6-year-old on touch). The scoring logic is placement-agnostic: it checks the
final arrangement, so a future drag affordance is a drop-in fast-follow.

### 3.1 `sort-categories`

Tap an item, then tap a labeled bin; the item drops in. A wrong bin re-prompts
(shake + increment attempts, never fails); the activity completes when every
item is in its correct bin.

```
config: {
  instruction: string,
  bins:  [{ id: string, label: string, emoji?: string }]   // 2–4 bins
  items: [{ label: string, emoji?: string, binId: string }] // 3–8 items; binId ∈ bins.id
}
```

`isCorrect`: every item placed in the bin whose id equals its `binId`.
`skillsAffected`: `["science.classify"]`.

### 3.2 `seq-order`

Tap the cards in the correct order (1st, then 2nd, …). A wrong next-pick shakes
(+attempt); completes when the full sequence is selected correctly.

```
config: {
  instruction: string,
  cards: [{ label: string, emoji?: string }]   // 3–6 cards; ARRAY ORDER = correct order
}
```

The Player presents the cards **shuffled deterministically** (a stable shuffle
seeded off the activity id — no `Math.random()`, keeping render/tests
deterministic) and the child taps them into 1..n order. `isCorrect`: the child's
tapped order equals the config's array order. `skillsAffected`:
`["science.sequence"]`.

### 3.3 Shared interaction rules

Big tap targets (≥44px / `min-h-11`), static Tailwind class maps only, Phosphor
icons only, TTS-narrated instructions via the existing `readAloud`/`SpeakerButton`
seam. Forgiving: a wrong tap re-prompts (`useWrongShake` + attempts), NEVER
auto-completes; only a fully-correct arrangement completes and scores via
`firstTryRateFromAttempts` → `starsFromAccuracy`/`outcomeFromAccuracy` (≥1 star
floor). Mirror B1's `math-money`/`math-clock` Players for structure.

## 4. Content — a New Unit in `kaelyn-adaptive`

A **"Science & Nature"** unit authored as static TS appended to
`src/content/programs/kaelyn-adaptive.ts`, rendered as its own **map world**
using the existing `ocean` world theme (visually distinct from B1's `garden`; no
new Wonder Studio token).

- **3 lessons:** Sorting & Classifying · Life Cycles & Order · Nature & Weather.
- **~10–12 activities** (3–4 per lesson): `sort-categories` (living/nonliving,
  animal groups, materials), `seq-order` (butterfly/frog/plant life cycles,
  day→night, seasons), plus optionally one short `reading-comprehension` science
  text in the Nature lesson for observation texture (reuses an existing kind —
  no new work).
- Authored by Claude, **parent-reviewed before seeding** (spec §9). Age-
  appropriate (entering grade 1), gentle, factually correct. Pronunciation
  overrides only where a spoken term mis-reads.

## 5. Skills & Parent Reporting

New skill tags in `src/content/skills.ts` (each a `Skill` with
`readyIndicator`/`stretchIndicator`), carried in the new activities' `skillTags`:

- `science.classify` — sort and group objects by an observable attribute.
- `science.sequence` — put life-cycle stages / events in order.

Two tags only. The Nature & Weather lesson maps onto these (e.g. sorting
weather/materials = `classify`; ordering a day or the seasons = `sequence`); a
`reading-comprehension` science text there carries its existing `reading.*` tag,
so no third science tag is needed (avoids an unused tag).

New `SkillDomain` **`"science"`** added to the union in `src/content/types.ts`
and to `DOMAIN_ORDER` (whose compile-time exhaustiveness guard, added in B1,
forces this), giving a distinct **"Science & Nature"** parent-report row. The
mastery engine, recommender, quest, and star systems consume skill tags + units
generically — **no changes**.

## 6. Integration Points (all B1-established)

- **`src/content/activity-configs.ts`:** add the 2 zod config schemas + `*Config`
  types + the 2 `ACTIVITY_CONFIG_SCHEMAS` entries (auto-extends `ActivityKind`).
- **`src/content/types.ts`:** add 2 `ActivityOf<kind, Config>` members to the
  `Activity` union; add `"science"` to `SkillDomain`.
- **Every exhaustive-`ActivityKind` site** (the B1 lesson — a missed one is a
  full-suite RED): `ACTIVITY_META` + `ACTIVITY_KIND_LABEL` (icon+label),
  `defaultConfigFor` (admin skeletons), the registry (`src/content/registry.ts`
  + `src/activities/index.ts`), and `src/activities/index.test.ts`'s strict
  "every kind registered" invariant. `KIND_BRIEF` stays `Partial` with the 2
  kinds **absent** so they remain non-AI-generable (`isGenerableKind` gate).
- **`scripts/seed-content.ts`:** no code change — the new unit + skills ride the
  existing seed of `kaelyn-adaptive` / `SKILLS`.
- **No DB migration** — domain/kinds/content are data (text columns).

## 7. Deploy & CI (the B1 lesson, made explicit)

- The content rides `seed-content.ts`, which the homelab pre-deploy E2E gate
  already runs — **no CI-gate change needed** (unlike Phase A's `seed-motivation`).
- **REQUIRED post-merge prod step:** re-run `scripts/seed-content.ts` against the
  prod DB (port-forward `svc/kaelyns-academy-db-rw` + `DATABASE_URL=<db-app uri,
  host→127.0.0.1> bun scripts/seed-content.ts`). Curriculum is DB-preferred, so
  the new "Science & Nature" unit will NOT appear on prod until re-seeded. The
  seed is idempotent (`onConflictDoUpdate`, upserts `kaelyn-adaptive@v1` in
  place, one transaction). This step was missed in B1's plan and caught in the
  canary — it is now an explicit slice deliverable.

## 8. Testing

- **Per-plugin `logic.test.ts`:** `sort-categories` `isCorrect` (all-correct vs
  a misplaced item) + the stars ladder; `seq-order` `isCorrect` (right order vs
  a wrong pick) + the deterministic-shuffle helper (same input → same shuffle,
  and the shuffle is a permutation) + the stars ladder.
- **Content validation:** the existing `src/content/validate.ts` walker must pass
  the new unit (registered kinds, skill tags exist, unique ids); add a focused
  assertion for the new unit. **Answer-key correctness** is hand-audited in
  review (bins reference real bin ids; sequence order is factually correct for
  the life cycles).
- **e2e smoke:** the "Science & Nature" world renders on `/learn/kaelyn-adaptive`
  and one activity of each new kind loads (prod-gated; seeded via seed-content,
  which the CI gate runs).
- Full gate before merge: `bun run lint && bun run typecheck && bun run test &&
  bun run build` + `bun run audit:dead-code`.

## 9. Non-Goals (this slice)

- No true drag-and-drop (tap-to-place; drag is a clean fast-follow).
- No AI "more, made just for me" generation for the new kinds (authored-only;
  they stay absent from `KIND_BRIEF`).
- No assessment / placement / `checkpoint_result` (Phase C).
- No other subjects (Social Studies, Art & Music) or grade-1 ramp of existing
  strands — later Phase B slices.
- `math-measure` reuse is optional texture, not a requirement.

## 10. Decision Log

| Decision | Choice | Alternatives |
|---|---|---|
| Slice | Science & Nature (B2, vertical subject slice) | — |
| Interaction | Tap-to-place | True drag-and-drop (fiddly for 6yo; needs a dnd lib) |
| Plugin config shape | Single-interaction (no `mode`) | Two-mode like B1 (unnecessary here) |
| seq-order shuffle | Deterministic (seeded off activity id) | `Math.random()` (breaks test/render determinism) |
| Skill domain | New `"science"` domain (distinct report row) | Fold into an existing domain |
| World theme | `ocean` (distinct from B1's garden) | `garden` (best thematic fit but shared with B1) |
| AI practice | Authored-only (non-generable) | AI-generable |
| Content home | New unit in `kaelyn-adaptive` | New standalone program |
