# Meaningful Lesson Interactions

**Date:** 2026-07-14
**Status:** Approved 2026-07-15
**Scope:** Every live activity plugin, its active Kaelyn curriculum uses, completion integrity, and shared learner-host behavior

## 1. Context

Kaelyn's Academy has fourteen registered activity plugins. The registry and config catalog are structurally complete: every configured kind has a Player, and the active program union exercises all fourteen kinds. The problem is not missing registration. It is that several Players ask the child to perform an action that does not actually exercise the skill named by the lesson.

The clearest example is math-clock set mode. The approved Life Skills Math design required the child to move an analog clock hand with snapping. The implementation plan replaced that interaction with twelve hour buttons and a separate :00/:30 selector. The rendered SVG clock became a preview of a digital choice rather than the object the learner manipulates.

The audit found the same class of mismatch elsewhere:

- math-measure displays an already-countable row of units and asks for a multiple-choice number instead of measuring an object.
- math-array shows a completed array and asks for a +/- number rather than building, dealing, grouping, or tiling.
- several math-tenframe activities claim multiplication, regrouping, fractions, or place-value evidence without implementing those actions.
- seq-order accepts only the next correct card, so the child never constructs and revises a sequence.
- sort-categories rejects each wrong placement immediately and presents authored items in answer-group order.
- journal-prompt can award full mastery for a blank submission and emits skill evidence that does not match its authored composition skills.
- some literacy and language activities claim retell, morphology, production, or fluency evidence that their interaction never observes.
- language multiple choice reveals the answer and advances after a wrong tap, which can reward guessing.

The current unit suite largely tests schemas and pure score functions. Where the Player itself is the pedagogy, interaction coverage is thin.

## 2. Goal

Every lesson must make the learner perform the mental and physical action named by its objective. Direct manipulation is used when spatial arrangement, quantity, sequence, or composition is part of the skill. Recognition choices remain where recognition is the intended skill.

The pass succeeds when:

1. Kaelyn can complete every active activity with touch, pointer, keyboard, and visible instructions when audio is unavailable.
2. The primary interaction genuinely exercises the authored skill.
3. No client can mint stars or mastery evidence by supplying a forged score.
4. Invalid or contradictory configs fail closed before a child attempts them.
5. Wrong attempts preserve work, provide specific guidance, and never shame or time the learner.
6. Advanced material that is beyond an on-track child entering first grade is placement-gated or marked stretch rather than presented as an assumed floor.
7. The implementation uses the simplest rendering technology that preserves the learning action.

## 3. Scope Boundary

This work preserves the intended curriculum objectives and repairs their interaction and evidence contracts. Authored copy or progression changes only when the existing implementation cannot honestly represent or assess the objective.

One narrowly scoped plugin, math-fraction-bar, is added because equal partitioning is not an array-area interaction. No generalized lesson engine is introduced.

The active kaelyn-adaptive curriculum and live World Language programs are aligned. The excluded Summer Bridge source is not republished by this work, but shared validation must prevent its legacy skill mismatches from silently returning if it is reactivated.

## 4. Design Principles

### 4.1 Construct validity first

The child's action must match the skill:

- Set an analog time by manipulating an analog clock.
- Measure by aligning or placing units.
- Divide by sharing a visible collection.
- Sequence by arranging and revising a complete order.
- Sort by constructing classifications and checking them.
- Build a word from bounded sound or grapheme tiles.

Visual polish cannot substitute for this alignment.

### 4.2 Direct manipulation with equivalent alternatives

Drag is an enhancement, not the only input. Every draggable token also supports tap-select/tap-place and keyboard movement. Snap targets are generous and discrete. Precision gestures never determine academic success.

### 4.3 Forgiving is not answer-revealing

Wrong work stays visible. Feedback describes the next useful observation. The child can revise and check again. The product does not immediately reveal the correct answer and advance, because that changes practice into guessing.

### 4.4 Evidence must be earned and server-derived

Participation rewards may be generous, but mastery evidence is emitted only for behavior the activity observes. The server resolves the pinned activity, validates the response, and recomputes score and evidence. Browser-provided score objects are display hints only and are never persisted as authority.

### 4.5 DRY after proof, YAGNI throughout

Domain state machines remain local to their plugins. A shared primitive is extracted only after at least two real activities need the same behavior. There is no universal manipulative runtime.

### 4.6 Child-data posture remains unchanged

No open-ended child-to-model chat is added. AI-generated content stays bounded and schema-validated through the LiteLLM gateway. Microphone, drawing, and writing data follow the existing child privacy posture.

## 5. Rendering Choices

| Need | Technology | Reason |
|---|---|---|
| Clock face, clock hands, proportional measurement geometry, balance scale | Inline SVG | Semantic, responsive geometry with large invisible hit targets |
| Coins, counters, tiles, bins, slots, word cards, arrays | Semantic DOM and CSS | Best keyboard, focus, text, and screen-reader behavior |
| Optional token dragging | Existing @dnd-kit dependencies | Pointer, touch, and keyboard sensors without a new dependency |
| Freehand journal ink | Canvas 2D | Appropriate for unstructured drawing |
| Three-dimensional rendering | None in this pass | None of the current objectives requires depth or spatial rotation |

Three.js is explicitly out of scope. A 3D spinning clock, coin physics, or a WebGL classroom would add load and motor complexity without improving the measured skill.

## 6. Plugin Architecture

Each activity continues to own:

- its Zod config contract;
- a bounded response schema;
- pure state, geometry, validation, and scoring logic;
- its client Player;
- focused unit tests and route-level interaction coverage.

The ActivityType contract gains a response validator that is usable on the server. Server-safe plugin metadata exposes config parsing, response parsing, score, skillsAffected, and generated-config validation without importing client Players into server actions.

Shared behavior is intentionally small:

- an accessible token and destination seam for drag, tap, and keyboard parity;
- live placement and correction announcements;
- stable focus restoration after placement, errors, and completion;
- existing Prompt, SpeakerButton, PlayerControls, ChoiceGrid, speech, audio, reduced-motion, and wrong-feedback seams;
- one host-owned reward transition.

Clock geometry, balance-scale geometry, array dealing, ten-frame trading, phoneme blending, and sentence evidence remain domain-specific.

## 7. Canonical Completion Flow

1. The learner route resolves the exact version-pinned program, unit, lesson, and activity.
2. ActivityHost waits until learner and pinned-tree state are settled. It never renders a fallback current-version activity after a pinned tree resolved without that activity.
3. The host uses safe parsing. Invalid content renders a calm child-facing unavailable state and is captured non-critically.
4. The Player manages interaction state and returns only its bounded response.
5. For an account learner, recordAttemptAction receives activity identity plus the response. It does not receive an authoritative score.
6. The server re-resolves the pinned authored activity or learner-scoped generated shelf item, parses its config and response, invokes the server-safe plugin score, verifies evidence is a subset of the activity's authored skill tags, and records the canonical attempt.
7. The canonical result returns to the host, which shows one reward screen. Plugins do not render a second reward overlay.
8. If persistence fails, the completed response remains in memory and the host offers a calm retry. It does not silently discard the work or mark the skill negatively.
9. Guest mode uses the same config, response, and scoring contracts locally because it has no server attempt ledger.

Generated shelf lookup is scoped to both account and selected learner. The route unit must contain the requested activity. Replacing an activity with another config remounts the Player using a stable version-aware key so stale state cannot leak across items.

## 8. Lesson Interaction Contracts

### 8.1 math-clock

Read mode remains analog face to digital choice because decoding the face is its objective.

Set mode uses a numbered SVG clock as the only input surface. One canonical value represents minutes after twelve and snaps to the twenty-four half-hour positions around a twelve-hour clock. The visual formulas are:

- minute-hand angle = minute within the hour times 6 degrees;
- hour-hand angle = total minutes after twelve divided by 2 degrees.

Dragging either generous hand hit-area changes the single canonical value, so the hands cannot disagree. Pointer movement unwraps across twelve rather than jumping at the angle boundary. Release snaps to the nearest supported half-hour. Arrow keys move one half-hour. The control exposes one coherent time value and announces committed times; it never exposes independent hour and minute controls.

The face includes readable numerals. Reduced-motion mode snaps without a spinning transition. Wrong checks retain the chosen time.

### 8.2 math-money

Platform-dependent emoji are replaced by original SVG coin faces with stable relative diameter, color, edge, name, and value cues. A dime is visibly smaller than a nickel.

Count mode supports dragging a coin to the tray, tapping a coin then the tray, and direct keyboard placement. Tray coins can be removed individually. Counting feedback shows the arithmetic of the chosen coins without turning the task into watching an unrelated number counter. Generated configs validate unique palettes, reachable targets, and bounded solution size.

### 8.3 math-measure

Units mode renders the named object and an initially empty measurement line. The learner places equal units end-to-end. Snapping makes gaps and overlaps visible and correctable. The final count comes from placed units rather than a disclosed label or multiple-choice answer.

Length and height comparison let the learner align objects to a shared origin before choosing. Weight uses a simple SVG balance: objects are placed on pans, the beam tilts according to authored relative weight, and the learner can compare before answering. A generic visual size scalar is not treated as weight.

### 8.4 math-array

Answers are derived from rows and columns or rejected when an explicit authored answer contradicts them.

- build: fill an empty rows-by-columns structure.
- multiply: build or reveal complete rows, then activate each row to form a repeated-addition and skip-count sequence before answering.
- divide: deal a visible source pool into recipient rows or bins until every share is equal.
- area: tile an empty rectangle with unit squares; uncovered and overlapping regions remain visible.

The +/- stepper may remain only as an accessibility fallback, never the primary task. Build completion records meaningful placement state rather than automatic first-try success.

### 8.5 math-tenframe

Counters are individually placeable and removable. The standard left-to-right ten-frame organization is coached with highlighting and announcements rather than faking a tap on one cell as a tap on another.

Config validation rejects goals beyond frame capacity. The plugin supports only ten-frame-appropriate work: representing, adding, subtracting by removal, and making or trading a full ten. Multiplication groups move to math-array. Fraction partitioning moves to math-fraction-bar. Place-value activities that cannot be represented by making a ten are reauthored or placement-gated.

### 8.6 math-fraction-bar

The new focused plugin asks the learner to partition a bar or simple shape into a configured number of equal parts and identify one or more parts. Equal and unequal candidate partitions are visually inspectable. It does not inherit array-area scoring.

The first consumer replaces the active fraction lesson currently represented as a one-by-four emoji array. Additional modes are not added without active authored content.

### 8.7 sort-categories

The source pool is deterministically shuffled so authored grouping cannot leak the answer. The child places all items, moves them between bins, and checks the completed classification. Wrong checks identify which placement needs another look without moving it automatically. Bin names, counts, and contents are exposed semantically.

### 8.8 seq-order

Cards are deterministically shuffled from stable activity identity. The child fills numbered slots, removes or moves cards, and checks the complete sequence. The Player no longer accepts only the next correct card. The ordered result is a semantic list with position announcements.

### 8.9 journal-prompt

A response requires at least a drawing mark, typed idea, scribed idea, or bounded dictation. Quality is not automatically graded. A genuine artifact earns participation stars but emits no composition mastery evidence without a human-observable rubric.

Sentence frames and word-bank items insert at the caret or into explicit blanks rather than appending blindly. Dictation uses functional state updates, separates transcript chunks with whitespace, surfaces unsupported and error states, and cannot overwrite newer typed text.

Canvas PNG data URLs are removed from attempt JSON. This pass records only a bounded participation summary (`markCount`, `textLength`, `usedDictation`, `mode`, and `didDraw`) and never persists the child's text, transcript, strokes, or image data. A saved-artifact gallery or writing archive would require a separate privacy, retention, and object-storage design.

### 8.10 phonics-wordbuild

Tap remains the primary reliable interaction; optional drag uses the same slots. Tile instances are bounded so repeated graphemes require available copies. Correct builds remain visible. A sound sweep voices each phoneme or grapheme in order, respects silent-letter metadata, then blends the whole word. The score maps only to authored phonics skills the build actually demonstrates.

### 8.11 sightword-game

Each round presents one spoken or short-context target and asks the learner to find it among plausible words. Moving targets, timers, and popping decoys are rejected because they add visual tracking rather than word recognition. Config validation enforces unique, disjoint targets and decoys and verifies instruction coverage where the instruction names a target.

### 8.12 reading-comprehension

Questions that claim textual evidence include authored sentence indexes or bounded evidence spans. The learner selects evidence and then an answer, or returns to the passage after a wrong answer. Structured retell uses ordered event cards or recorded adult-observable completion; an optional unrecorded retell prompt does not emit retell mastery.

Question kinds and emitted skills must match what the response observes. Ordinary multiple choice cannot claim fluency, morphology production, or open retell evidence.

### 8.13 oral-reading

Cold-read assessment and listen-then-repeat practice are explicit config modes. Modeling audio is not played before a cold read. Microphone denial, recorder failure, gateway unavailability, or an adult fallback produces no negative mastery evidence. STT can evidence bounded word accuracy; it does not claim prosody or phrasing it cannot measure.

The existing shame-free attempt cap and grown-up fallback remain.

### 8.14 lang-listen-match

The prompt is replayable. A wrong choice remains data, replays or preserves the target audio, and allows another attempt rather than revealing the answer and advancing immediately. Romanization is optional help, not an always-visible cue when listening discrimination is the objective. Audio, clip, and browser-voice failure leave a visible, retryable activity.

### 8.15 lang-symbol-intro

The learn phase presents two to four guided symbols at a time and uses the already-authored meaning, example, example-spoken, and spoken-prompt fields. Retrieval practice covers only taught inventory. Proceeding requires meaningful exposure, not simply opening the screen.

Tracing is deferred until real authored stroke-path content exists. Drawing a generic line over a glyph would not validate writing order and is therefore out of scope.

## 9. Curriculum and Evidence Alignment

Content alignment runs after plugin contracts land and is owned by one worktree.

Required corrections include:

- move four-groups-of-five work from ten-frame to array;
- replace fraction-as-array content with math-fraction-bar;
- make regrouping require an actual make-ten or trade action;
- replace answer values that contradict their model dimensions;
- mark multiplication, division, area, fractions, and other advanced material stretch or placement-gated for an on-track learner entering first grade;
- ensure every emitted evidence skill is present in the activity's authored skillTags and is directly observed by its response;
- remove stale writing.sentence evidence from active composition work;
- ensure journal participation does not automatically advance composition mastery;
- ensure generated-item validators enforce the same answer and evidence invariants as authored content.

The content test suite checks every active authored activity for config validity, registered kind, known skills, emitted-evidence subset alignment, answer integrity, and developmentally supported band. Exposure or participation activities may intentionally emit no mastery evidence.

## 10. Accessibility and Feedback Contract

Every manipulation provides:

- touch and pointer targets of at least 44 by 44 CSS pixels, with larger invisible hit regions for SVG hands;
- tap-select/tap-place and keyboard equivalents for drag;
- visible focus and stable focus movement after placement;
- state names that describe the learner's work without leaking the answer;
- polite live announcements for selection, placement, current count or time, correction, and completion;
- an always-visible instruction and replay affordance when audio is optional;
- reduced-motion behavior without decorative spins, long transitions, or shake-only feedback;
- text feedback paired with every spoken correction.

Pointer cancellation, viewport changes, and lost capture restore the last committed valid state. Wrong checks never clear the board automatically.

## 11. Testing Strategy

All behavior changes follow red-green-refactor.

### 11.1 Pure unit tests

- config and response schemas, including cross-field capacity and answer invariants;
- clock angle conversion, wraparound, snapping, and coupled-hand positions;
- token placement, removal, rearrangement, dealing, equal-share, unit-gap, unit-overlap, balance, and tiling reducers;
- deterministic shuffle stability and non-identity;
- phoneme-tile inventory and blend order;
- journal evidence and dictation text merging;
- language retry state;
- score, skillsAffected, and authored skill-tag alignment.

### 11.2 Host and action tests

- pinned route unit and activity resolution;
- no current-version fallback after a pinned miss;
- generated shelf selected-learner scoping;
- malformed config calm failure;
- response parsing and server-side canonical score recomputation;
- forged score and arbitrary evidence rejection;
- retryable persistence failure;
- Player remount on version-aware config change;
- one reward transition.

### 11.3 Browser tests

Playwright deep-links to stable authored activities and exercises:

- clock pointer drag, tap alternative, keyboard stepping, half-hour completion, and reduced motion;
- money drag/tap parity and removal;
- measurement unit placement and balance;
- array build, fair sharing, and area tiling;
- ten-frame removal and make-ten;
- fraction partitioning;
- sort rearrangement and complete check;
- sequence rearrangement and check;
- journal blank guard and text/drawing completion;
- phonics build and blend;
- sight-word target rounds;
- comprehension evidence and retry;
- oral-reading permission and service failures;
- language wrong-then-retry and audio failure.

Role and accessible-name assertions are part of the flow. Desktop and tablet-size walkthroughs confirm that boards do not overflow or create precision-only targets.

### 11.4 Final gate

The integrated branch must pass:

- bun run lint
- bun run typecheck
- bun run test
- bun run build
- targeted local Playwright interaction specs

Warnings are failures. No linter suppression or TypeScript ignore is permitted.

## 12. Worktree Execution

Work happens in isolated branches based on the same reviewed foundation commit.

### Wave 0: Foundation

Owns ActivityType response validation, server-safe scoring registry, attempt action integrity, host pinned readiness, generated learner scoping, one reward flow, shared feedback seams, and a behavior-preserving split of central config/program files into per-kind and per-unit modules so later worktrees are genuinely disjoint.

### Wave 1: Parallel plugin work

- life-skills worktree: math-clock, math-money, math-measure;
- structured-math worktree: math-array, math-tenframe, math-fraction-bar;
- order-writing worktree: sort-categories, seq-order, journal-prompt.

### Wave 2: Parallel plugin work

Wave 2 begins from the reviewed, integrated Wave 1 base.

- literacy worktree: phonics-wordbuild, sightword-game, reading-comprehension, oral-reading;
- language worktree: lang-listen-match, lang-symbol-intro;

Each plugin worktree owns the per-kind config modules and per-unit authored content it changes. After both plugin waves integrate, a content-alignment worktree owns centralized generated validators/briefs and the cross-plugin evidence audit. Shared aggregators and centralized AI files are never edited concurrently. Each worktree follows TDD, runs its targeted suite and typecheck, commits intentionally, and receives a separate spec and quality review before integration.

The integration branch merges reviewed commits, resolves only planned contract updates, runs the full gate, performs local browser walkthroughs, and receives a final whole-branch review.

## 13. Non-Goals

- No Three.js, 3D physics, AR measuring, or camera access.
- No timers, speed rounds, loot, streak pressure, or moving sight-word targets.
- No universal drag-and-drop lesson engine.
- No drag-only activity.
- No open-ended child-to-LLM chat.
- No live streaming speech highlighting unless the existing bounded speech service later provides a separately reviewed contract.
- No automatic grading of drawing, composition quality, prosody, or phrasing.
- No saved journal-art gallery in this pass.
- No broad curriculum rewrite unrelated to activity/objective alignment.

## 14. Review Findings and Decisions

Three internal domain audits reviewed all fourteen plugins and their active content uses. Grok 4.5 independently prioritized clock coupling, measurement by placement, structural array work, honest evidence, and DOM/SVG over WebGL. Gemini 3.1 Pro also recommended direct clock manipulation, draggable measurement units, and richer placement.

The reviewers disagreed on universal dragging and decorative game motion. Gemini proposed broad drag conversion, moving sight-word targets, and streaming speech highlights. Those proposals are rejected here because they violate YAGNI, add motor or visual-tracking tax, and do not improve the measured construct. Grok and the internal audits' emphasis on skill/action integrity governs this design.

## 15. Decision Log

| Decision | Choice | Rejected alternative |
|---|---|---|
| Overall architecture | Vertical plugin repair | General manipulative engine; clock-only patch |
| Geometry | Inline SVG | Three.js or Canvas geometry |
| Token movement | DOM with existing @dnd-kit plus tap/keyboard parity | Native drag only; free precision drag |
| Clock model | One coupled canonical time value | Independent hour and minute controls |
| Wrong answers | Preserve, guide, revise, recheck | Reveal and auto-advance; clear the board |
| Score authority | Server recomputes from pinned config and parsed response | Trust client score/evidence |
| Journal reward | Participation reward without automatic mastery | Blank full mastery; automated quality grading |
| Fractions | Focused math-fraction-bar plugin | Continue overloading math-array |
| Three-dimensional content | Deferred until a real 3D learning objective exists | Decorative WebGL now |
| Parallel execution | Foundation followed by disjoint plugin worktrees and one content owner | Concurrent edits to shared host and program files |

## 16. Acceptance Criteria

The work is complete only when:

1. All fifteen activity plugins validate both config and response.
2. Active content has no contradictory answer, unknown skill, or evidence mismatch.
3. Clock set mode is completed by manipulating coupled SVG hands.
4. Measurement, array, division, area, sorting, sequencing, and fraction activities require construction of the relevant model.
5. Journal blank work cannot create mastery evidence.
6. Language wrong answers permit supported retry instead of forced reveal and advance.
7. Account attempts store only server-derived score and evidence for the selected learner and pinned activity.
8. Each direct manipulation has touch, pointer, tap, keyboard, screen-reader, and reduced-motion behavior.
9. Only one reward screen appears per completion.
10. Targeted browser flows and the full project gate pass with no warnings.
