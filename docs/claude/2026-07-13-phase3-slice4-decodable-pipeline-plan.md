# Phase 3 Slice 4 — Decodable-Text Pipeline + Starter Library — Implementation Plan

Date: 2026-07-13. The FINAL slice of Phase 3 ("Fluency + memory").
Follows Slices 1 (sentence reading+WCPM), 2 (scheduler), 3 (fluency dashboard).
Roadmap: `docs/claude/2026-07-12-growth-roadmap-research.md`.

## Goal

Give the reading tutor a real **library of decodable passages** — short
sentences an entering-first-grader can *sound out*, grouped by phonics pattern
(short-vowel CVC → digraphs → blends) following the curriculum's week 1–5
scope — surfaced as `oral-reading` **sentence** activities (the mode shipped in
Slice 1). This is the content that makes the read-aloud verifier + karaoke +
WCPM + scheduler (Slices 1–3) actually exercise decoding growth.

## Locked decisions (from scouting)

| Decision | Choice |
|---|---|
| Schema | **No change.** Reuse `oralReadingSentenceConfig` (`activity-configs.ts:315-333`): `{mode:"sentence", instruction(≤200), passage(≤60 chars, ≤7 words, /[a-z0-9]/i), skillTag?}`. Every passage stays ≤7 words (the kaelyn-stt 15s decoded-speech cap). |
| Skill tag | **Reuse `reading.fluency.phrasing`** (the Slice-1 sentence tag; resolves; decodable oral reading IS fluency practice). NO new `phonics.decode` skill — that would mean a new SKILLS entry + parent-report row + placement wiring = scope creep. Decodability stays **authoring metadata**, not a runtime skill. |
| Library location | **New module `src/content/decodable/`** exporting a factory: `decodableReaderActivities()` maps `{phonicsPattern, passages: string[]}[]` → `oral-reading` sentence `Activity[]` (unique ids `decodable-<pattern>-NN`, `band:"ready"`, `skillTags:["reading.fluency.phrasing"]`, `config.skillTag` === that tag). Pure, deterministic, unit-testable. |
| Placement in tree | A **NEW unit `decodable-readers`** (world `ocean`) in `kaelyn-adaptive.ts`, NOT `word-study` — because `content.test.ts:148` hard-codes the word-study sentence id list (`["word-sentence-see-cat","word-sentence-run-play"]`) and adding sentences there breaks its `toEqual`. New unit keeps that tripwire green. Group passages into **lessons by phonics pattern** (e.g. lesson "Short a", "Short e", …, "Digraph sh", …) — ~5–6 lessons × ~4–5 passages, so the unit reads as a structured readers shelf, not a 30-item wall. |
| Phonics pattern taxonomy | A lightweight string-union `PhonicsPattern` (`"short-a-cvc" \| "short-e-cvc" \| … \| "digraph-sh" \| "digraph-ch" \| "digraph-th" \| "blend-initial" \| "blend-final"`), used only to GROUP the library + name ids/lessons. Not a config field, not a skill. |
| Starter set | ~24–30 passages across CVC (a/e/i/o/u), digraphs (sh/ch/th), blends — all ≤7 words, decodable for their pattern, using only already-taught Dolch sight words (`docs/curriculum/summer-k-to-grade1/sight-words.md`). Sourced from the week 1–5 scope (`weeks-01-05.md`). |
| Content gates | `content.test.ts` existing tripwires apply automatically (config parses, skillTag resolves, ids unique program-wide + globally, oral-reading skillsAffected⊆skillTags). Add a **new light tripwire** for `decodable-readers` (every activity `kind:"oral-reading"` sentence, band ready, skillTags==[reading.fluency.phrasing], passage ≤7 words). The word-study `:148` exact-id list stays UNTOUCHED. |

## Files

Create:
- `src/content/decodable/index.ts` (+ `index.test.ts`) — `PhonicsPattern` union;
  the passage data table `DECODABLE_LIBRARY: {pattern, lessonTitle, passages}[]`;
  `decodableReaderActivities()` factory → `Activity[]` (deterministic ids/titles,
  ≤7-word assertion in the test). Pure; no DB/AI.

Touch:
- `src/content/programs/kaelyn-adaptive.ts` — add the `decodable-readers` unit
  (world ocean, a sensible `order` after the existing units, no collision),
  its lessons built from the factory grouped by pattern. Do NOT touch
  `word-study` or the existing `word-sentence-*` items.
- `src/content/content.test.ts` — add the `decodable-readers` tripwire block
  (mirror the existing per-unit blocks); DO NOT change the word-study `:148` list.
- `e2e/specs/oral-reading.spec.ts` — add ONE case deep-linking a representative
  decodable activity (e.g. `/learn/kaelyn-adaptive/decodable-readers/decodable-short-a-01`)
  reusing the existing sentence fake-recording harness (mocked STT, karaoke
  never-red, reward CTA is a LINK). One passage proves the whole factory batch
  renders + routes.

## Sequencing / risks

- Adds AUTHORED CONTENT → **prod `seed-content` re-run REQUIRED post-merge** (the
  app reads DB-published content; new unit/activities 404 until re-seeded).
- **New world-map unit:** a new `decodable-readers` unit appears on the learner
  world map. Reviewers must confirm: it has a valid non-colliding `order`, a
  world, doesn't disrupt existing unit progression/locks, isn't a checkpoint
  unit, and doesn't break any unit-count/e2e assumptions. Keep it a normal
  `ready`-band supplementary readers unit.
- **Decodability quality:** each passage must be genuinely decodable for its
  pattern using only taught graphemes + Dolch sight words — the pedagogy is the
  point. Reviewers (and a curriculum sanity pass) should check no passage sneaks
  in an untaught grapheme or an over-7-word/over-60-char line.
- e2e must pass the pre-deploy gate: reward CTAs are LINKS not buttons; guests
  land straight on the world map; sentence karaoke never-red (Slice 1 lessons).
- After this ships, Phase 3 is COMPLETE (all 4 slices).
