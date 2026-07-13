# Phase 3 Slice 1 — Sentence Reading v2 (karaoke + WCPM evidence) — Implementation Plan

Date: 2026-07-13. Follows Phase 2 v1 (`oral-reading` single words, PR #60/#61, live e2c41af).
Roadmap: `docs/claude/2026-07-12-growth-roadmap-research.md` (Phase 3 "Fluency + memory").
Phase 3 is being shipped as **reviewed increments**; this is Slice 1 of 4
(2=spaced-repetition scheduler, 3=parent fluency dashboard, 4=decodable pipeline).

## Goal

Extend the `oral-reading` kind to read a short **sentence/passage** aloud, with
per-word "karaoke" feedback: during the listen-first model, an even-paced
active-word cursor sweeps left to right; after verification, confirmed words
settle **green** and uncertain words **honey** from left to right (tap a honey
word to hear it), **never red**. Live word highlighting during the child's own
reading is deferred because deterministic Slice 1 verification has no streaming
alignment. Compute **WCPM** (words correct per minute) from server-side
timestamps and persist it as indicative evidence so Slice 3 can chart it against
the Hasbrouck–Tindal grade-1 ladder; it never gates stars or skill evidence.
Same §8 posture as v1: audio in-memory and discarded, no transcript ever
stored/returned, parent two-control gate.

## Locked decisions (from scouting)

| Decision | Choice |
|---|---|
| Kind shape | **Extend** `oral-reading` via `z.discriminatedUnion("mode", …)` — NOT a new kind. `mode:"word"` is the default and keeps v1 byte-identical (protects the 5 authored `word-oral-*` items + Program-01 seed byte-identity). `mode:"sentence"` adds a larger `passage` field. Mirrors `mathClockConfig`/`mathMoneyConfig`/`mathMeasureConfig` unions. |
| STT response | Opt-in OpenAI `response_format=verbose_json` on `kaelyn-stt` → `{text, words:[{word,start,end,probability?}], duration, …}`. Default/absent path returns unchanged `{"text":…}` (LiteLLM passthrough + v1 untouched). |
| Correctness | From **alignment of the KNOWN target against transcript words** (reuse the forgiving matcher's normalize/homophone/token rules), NOT from `probability`. `probability` is an optional confidence signal only — tolerate its absence (LiteLLM may strip the non-standard field). |
| WCPM authority | **Server-side, from STT word timestamps** (first→last matched word span), never client-measured recording length. Route computes it. |
| WCPM persistence | Inside `OralReadingResponse` → flows verbatim to the `attempt.response` jsonb column (`schema.ts` `response: jsonb().$type<unknown>()`). NOT `attempt.score` (stripped to `{correct,total,stars,skillEvidence}`) and NOT `skill_state` (coarse `not_yet|emerging|solid`). WCPM in the child data export is fine; transcript must never appear. |
| WCPM scoring | **Recorded evidence only.** Sentence stars and skill evidence derive from aligned accuracy plus `fallbackUsed`; WCPM does not gate or boost either. There is no authored `targetWcpm` scoring field. |
| Karaoke scope | Slice 1 highlights the active word only during listen-first authored TTS, using a deterministic even-paced sweep that is canceled on interruption/mic start/unmount and disabled for reduced motion. Results settle green/honey left-to-right with a deterministic stagger. The child's own live reading has no cursor; that requires streaming alignment and is deferred. |
| Recording window | Word mode keeps its 8-second hard cap. Sentence mode derives a bounded deadline from authored word count at a generous 15 WCPM plus setup margin, clamped to 8–18 seconds (7-word max keeps a 30 WCPM reader within the STT 15s speech cap); verification retains its separate timeout and two-attempt cap. |
| Skill tag | Reuse `reading.fluency.phrasing` (readyIndicator = "reads a passage in phrases, at a talking rate"). No new tag. |
| Never-red | Sentence karaoke uses only green (confirmed) / honey (uncertain) / neutral (upcoming). No error/red state ever surfaces to the child; mic/service failure → the same grown-up fallback as v1, still ≥1 star. |

## Workstream A — `kaelyn-stt` service (homelab repo)

`homelab/docker/kaelyn-stt/server.py`:
- Add `_Word` protocol (`word/start/end/probability`) and extend `_Segment`
  with `words: list[_Word] | None`.
- Handler: accept `response_format: str | None = Form(default=None)` (and,
  if LiteLLM forwards it, `timestamp_granularities[]`). When
  `response_format == "verbose_json"`, call `model.transcribe(..., word_timestamps=True)`
  and return `{text, task:"transcribe", language, duration, words:[{word,start,end,probability}]}`
  (floats rounded). Otherwise the **exact current** `{"text": …}` branch,
  `word_timestamps=False`.
- Empty-speech short-circuit returns `{"text":"", "words":[]}` when verbose so
  the shape is stable.
- No change to middleware/guards/lock/semaphore/`trim_silence`/`vad_filter=False`.
  Words are computed on the already-trimmed PCM (so timestamps are relative to
  trimmed audio — fine for WCPM, which uses the matched-word span, not absolute).
- Tests (`tests/test_server.py`): extend the fake `_Segment` with `words`, add
  `_Word`; new `test_verbose_json_returns_word_timestamps` (asserts `words[]`,
  `text`, and `model.calls[..]["word_timestamps"] is True`); keep the existing
  default-shape regression test green; empty-speech verbose case.
- **Deploy note:** service change → CI rebuilds image + repins digest (weights
  already baked; no manifest change needed). Follows `build-kaelyn-stt.yml`.

## Workstream B — app (`kaelyns-academy` repo)

Create:
- `src/lib/ai/oralReadingAlign.ts` (+ test) — pure. Given the target passage
  words and the STT `words[]`, produce a per-target-word alignment
  (`correct | unclear`) via a forgiving needle/sequence alignment reusing
  `normalizeOralReading` / `tokenMatches` / `HOMOPHONE_*` from
  `oralReadingMatch.ts`. Compute WCPM = (matched word count) /
  (span-minutes from first→last matched word timestamp), guarded against
  zero/short spans; clamp to a sane range. Returns
  `{result:"matched"|"unclear", perWord:[{state}], wcpm, correctCount, totalWords}`.
  No raw transcript in the output.
- `src/activities/oral-reading/SentenceReader.tsx` (+ test) — the sentence
  Player branch: listen-first (Kokoro narrates the whole passage via
  `useSpeakOnce`), big mic, records, POSTs, then renders the passage with
  per-word karaoke. The authored narration gets an even-paced active-word
  cursor; verification states reveal green/honey left-to-right; tap a honey
  word → `speech.speak(word)`. The cursor is cancel-safe, honors reduced motion,
  and never runs during the child's own reading. Same 2-attempt cap + grown-up
  fallback + never-red ladder as v1. Sentence recording time is word-count-aware
  and clamped to 8–18 seconds. Deterministic, Phosphor icons.

Touch:
- `src/content/activity-configs.ts` — `oralReadingConfig` becomes a
  discriminated union on `mode`; export the sentence config type; keep `word`
  the default so absent-`mode` authored items parse unchanged.
- `src/activities/oral-reading/logic.ts` — `OralReadingResponse` gains optional
  `wcpm`, `perWord`, `correctCount`, `totalWords` (all optional so v1 responses
  still validate); `score()` handles the sentence branch (forgiving ladder,
  finish ⇒ ≥1 star, strong accuracy ⇒ 3, WCPM ignored); `skillsAffected()` unchanged
  (`config.skillTag`). `validateGenerated` structural for the new branch.
- `src/activities/oral-reading/Player.tsx` — when `config.mode === "sentence"`,
  render `<SentenceReader/>`; else the existing word Player.
- `src/app/api/oral-reading/route.ts` — mode-aware: accept an optional
  `mode`/`passage` (validate a longer passage: cap 60 chars / 7 words, bounded by the kaelyn-stt 15s decoded-speech budget);
  for sentence mode call `transcribeOralReading` with `response_format:
  "verbose_json"`, run `oralReadingAlign`, return
  `{result, words:[{state}], wcpm}` — still no transcript. Keep rate-limit →
  bounded body → guest 403 → §8 two-control gate order intact. `captureNonCritical`
  on failure → `{result:"unavailable"}`.
- `src/lib/ai/transcribe.ts` — add an optional `wordTimestamps` arg; when set,
  POST `response_format=verbose_json` and return `{text, words}` (words optional
  so the default call still returns just text). Never log words/text.
- `src/content/programs/kaelyn-adaptive.ts` — author 2–3 `mode:"sentence"`
  oral-reading activities in the word-study strand using already-decodable
  sentences (e.g. "We can see the cat.", "I like to run and play."). Satisfy
  `content.test.ts` (unique ids, resolvable skillTags, skillsAffected ⊆ skillTags).
  Do NOT touch the existing `word-oral-*` items or the 3 reading-comprehension
  activities (Word Study tripwire).
- `e2e/specs/oral-reading.spec.ts` — add a sentence-mode test: mock
  `/api/oral-reading` returning `{result:"matched", words:[{state:"correct"},…],
  wcpm:42}`, assert green karaoke settle + "You read it!" (never red); plus the
  mic-denied grown-up fallback for sentence mode.

## Sequencing / privacy / risks

- A and B build in parallel (B tests against the documented verbose shape +
  mocked route). Service lands first end-to-end, then verify WCPM live.
- **§8:** word timestamps + WCPM are derived-only; the words ARE the known
  target, so returning per-word state reveals no new PII. Transcript stays in
  request scope, never returned/logged/persisted; WCPM/`perWord` are safe in
  `attempt.response` (and the export).
- **Risk accepted — client-authoritative attempt evidence:** `wcpm` and
  `perWord` are echoed by the client into `attempt.response`, as are all other
  activity responses/scores in the platform-wide client-authoritative attempt
  recording flow. This follows the Phase 2 target-binding risk acceptance and
  `provenance-client-echo` precedent. For the single-tenant household posture,
  Slice 3 treats WCPM as indicative self-data rather than trusted assessment or
  an input to child-facing stars/mastery.
- **Risk — LiteLLM strips `words[].probability`:** correctness must not depend
  on it. Verify live post-deploy that `words[]` (word+start+end) survive the
  LiteLLM hop; if even timestamps are stripped, fall back to a documented
  deviation (client-measured duration for WCPM only, gated) — but the plan
  assumes timestamps survive (they are standard OpenAI verbose_json fields).
- **Seed:** new authored sentence items require a prod `seed-content` re-run
  post-merge (DB-preferred curriculum), same as every content ship.
