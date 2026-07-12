# Growth Roadmap Research — 2026-07-12

Synthesis of five parallel research streams: codebase map (Explore agents), pedagogy/product research, read-aloud ASR research, child-UX research, and an independent Codex (GPT) opinion grounded in this repo. Full agent reports live in the session transcript; this doc captures the converged conclusions and the proposed build order.

## Where the platform stands (grounded in code)

- **13 activity kinds, all tap-based.** No drag-and-drop; only `journal-prompt` uses typing/drawing/dictation. Registry: `src/content/registry.ts`, wiring `src/activities/index.ts`.
- **TTS output is mature** (Kokoro-first with browser fallback, MinIO caching, `[label](/IPA/)` phoneme overrides, admin PronunciationHelper) — but read-aloud is **on-tap**, instructions don't reliably auto-play, and there is **no karaoke/per-word highlighting**.
- **Speech input is essentially absent.** The only ASR is journal dictation via browser `SpeechRecognition` (`src/activities/journal-prompt/useDictation.ts`). **The app cannot verify the child read anything aloud** — reading is gated by tapping answers and self-attested "I read it" buttons (`reading-comprehension/Player.tsx`).
- **Content model scales well**: DB-backed versioned curriculum (publisher → program → program_version → unit → lesson → activity), skill domains, mastery engine (`src/lib/tutor/mastery.ts`), adaptive shelf (B3), baseline placement. World-Languages is the working precedent for adding a whole new subject family.
- **Wonder Studio** is a strong identity (paper/ink/honey/coral, Fraunces + Lexend, 3px outlines, per-world accents) but hierarchy is flat — everything gets the same outline/shadow treatment, so nothing reads as "the one thing to tap."

## Consensus flagship: Oral Reading Fluency (read-aloud verification)

All four external streams independently converged here. Amira-style oral reading coaching shows ~0.40 effect size / 2–3× typical growth, and the Hasbrouck–Tindal WCPM ladder (G1 ~53 → G2 ~89 → G3 ~107 WCPM) is a measurable spine that literally spans grades 1–8 — the "grows with her" mechanism.

**Key technical facts:**
- Kindergartner/6yo ASR WER is up to ~35% — raw transcription + string compare guarantees demoralizing false "wrong"s. **Never trust the transcript; score against the KNOWN target text** via forced alignment + per-word confidence.
- **Web Speech API is rejected for verification**: Chrome ships child audio to Google — conflicts with §8 posture and COPPA (2025 amendments: audio must be used only to respond, never retained/trained on, deleted immediately).
- CPU is fine: faster-whisper `small`/`small.en` int8 transcribes 2–10s clips in well under a second on amd64.

**Agreed architecture (ASR agent + Codex align):**
- New in-cluster FastAPI service (same deployment pattern as Kokoro), amd64 CPU, internal-only Service + NetworkPolicy (no outbound), audio processed **in-memory and discarded**; persist only derived per-word scores. Codex suggests routing it through LiteLLM's OpenAI-compatible `/audio` as a `kaelyn-stt` route to keep the AI boundary uniform.
- Browser: `getUserMedia`/`MediaRecorder` (webm/opus) + VAD endpointing (Silero server-side; auto start/stop so she never hits "stop").
- **v1** — new `oral-reading` activity kind: single words → short sight-word/phonics prompts. faster-whisper + forgiving phoneme-level fuzzy match to the known target. "Listen to me first" modeling via existing Kokoro.
- **v2** — sentences/passages: wav2vec2 forced alignment (torchaudio `MMS_FA`) or Montreal Forced Aligner for per-word timestamps → live karaoke highlighting + **WCPM**; GOP-CTC per-phoneme scoring with relaxed thresholds on developmentally-hard sounds (r, l, th, s-blends); ignore repetitions and self-corrections within ~3s. Optional kid-tuned Whisper (MyST fine-tune) if accuracy bites.
- **Scoring UX (all sources agree):** current word highlights as she reads; confirmed words settle green, uncertain words honey ("I couldn't hear that word"), **never red**; tap a honey word to hear Kokoro say it; re-record one sentence, not the whole passage; celebrate first, at most two focused rereads; always allow move-on; fallback when mic/service unavailable = "ask a grown-up to listen," no lost stars.

## UX overhaul — fixes the "too much non-obvious clicking" complaint

NN/g findings for 6–8s: if it looks like a button they tap it (inert decorations are harmful); one primary action per screen; they can't read the UI or point precisely; hover/scroll/double-click/long-drag silently fail; touch targets ~2cm (≈96px, vs the current 44px `--tap-min`).

**P0 (the complaint-killers):**
1. **One dominant next action per screen.** StudioHome/WorldMap and UnitView currently expose many parallel choices. Lead with a full-width pulsing "Continue today's adventure" (fed by `nextBest()`); map below; unit's full activity inventory behind "Pick something else."
2. **Audio-first instructions**: auto-play every instruction once on screen entry + persistent speaker/replay icon (Kokoro). Also actually propagate the parent "read-aloud by default" setting (Codex found `readAloud` isn't merged in `(learner)/actions.ts` learner config).
3. **~96px touch targets** with generous spacing; eliminate any hover/scroll-dependent interactions in players.
4. **Remove self-report gates and decision trees**: "I read it"/"I told it" buttons go away (replaced by oral reading or observable completion); RewardScreen shows one primary "Keep going," with Map as a quiet escape.

**P1:**
5. Map auto-focuses + pulses the next node; mascot voice "Let's go here!"
6. Idle nudge at ~3–5s: pulse CTA + re-speak prompt, escalating specificity.
7. "Tap anywhere to continue" on transition/celebration screens.
8. Fix known flow bugs: `StudioHome` re-asks "who is learning" every mount (`picked` state resets); `TodaysAdventures` quests activate but don't navigate — every quest row should be a one-tap Start/Continue with an href.
9. Persistent, fixed-position icon+word controls: "Map," "Listen," parent-PIN "Grown-up."

## Design direction (keep Wonder Studio, sharpen it)

- **Hierarchy over uniform pop**: reserve the 3px-outline + `shadow-pop` treatment for the single hero action and earned objects; paper/ink should be ~80% of an activity screen.
- **Color jobs**: coral-deep = "do this next," honey = earned/uncertain, green = confirmed, world accent = scenery only (cut repeated `bg-accent/12` tints).
- **Lexend for everything she must decode** (Fraunces only for brand/celebration); reader text ~28–32px, 1.65–1.75 line-height, 32–42ch measure, sentence-sized groups with active-line highlight. Evaluate dyslexia-aware option later.
- **Storybook spread, not stack-of-cards**: full-width illustrated trail map with landmarks; activity screen = one prompt + one canvas + one bottom action dock; move percentages/level pills/star totals to parent views.
- **SVG art kit over emoji** (extend the Mascot/Decorations inked-SVG language); emoji only as content pictograms/fallbacks.
- **Instructional motion only**: keep press feedback/path fill/star-pop; cut ambient floating/spinning during problem solving.
- **Age-scaling density**: same shell through grade 5, program metadata controls mascot frequency, control sizes (96px → 48–56px), reading measure, accent restraint.

## Growth engine (grades 1–5)

1. **Spaced-repetition/mastery scheduler** — upgrade the practice loop from difficulty-picker to memory-optimizing tutor: per-skill review at ~1/3/7/21 days, interleaving, item-level independence/freshness/latency tracking. (Spacing effect d up to 1.41 in 5–7yos; core Bloom 2-sigma driver.) Codex notes mastery.ts doesn't yet track the curriculum's 4-of-5 fresh-item gate.
2. **Phonics scope & sequence → decodable pipeline** — formalize the grapheme progression; LLM-generated decodables constrained to taught graphemes; feeds the ORF tutor. Grows into a tagged **decodable/early-reader library** (grapheme patterns, sight words, topic, complexity) that carries the same reading engine from CVC texts to early chapter books.
3. **Math fact fluency mode** — strategy-first, mastery-gated (within 10 → 20 → mult/div by G3-4), personal-best timing, no anxiety mechanics.
4. **Knowledge expeditions** — 2-week interest-driven themes (whales, volcanoes, Egypt) binding leveled reading + vocab + writing + math + one project; adds science/social-studies as reading-embedded subjects without new engines (elevates the existing InterestPicker/prompt theming).
5. **New plugin families** the authored curriculum already calls for: `oral-reading`/`reading-retell`, `math-number-line`, `math-fraction-bar`, sentence arranging/revision, trace/copy (handwriting), `project-checklist`/offline missions with a 2-second parent confirmation (no photos), maps/timelines, simple experiment observation.
6. **Spelling/encoding track** — "build the word you hear," reusing phonics sequence in reverse + existing wordbuild kind.
7. **Diagnostic upgrade** — evolve baseline placement into periodic re-diagnosis with a grade-scaled skill map (IXL-style).
8. **Authorship portfolio** — "I made this" surface preserving journal work, pairing early dictated pieces with later typed/written versions (fulfils assessment.md's portfolio promise).
9. **Parent dashboard: fluency growth** — WCPM trajectory vs Hasbrouck–Tindal benchmarks, skills mastered, review status.

## Motivation guardrails

Reward **mastery, not activity/time** (overjustification risk); process praise via mascot (effort/strategy, per Dweck); diegetic rewards (map progress, story beats) over points; no leaderboards, no loss-averse streaks, no time pressure. Structurally the product is immune to the Prodigy/ABCmouse failure modes — keep it that way.

## Proposed build order

| Phase | Theme | Contents |
|---|---|---|
| **1. "One big GO"** | UX overhaul (fast, high-visibility) | P0/P1 UX list, flow bugs (learner picker, quest navigation, readAloud setting), design hierarchy pass, 96px targets, audio-first instructions |
| **2. Read-aloud v1** | The flagship | `kaelyn-stt` k3s service (faster-whisper small.en int8 + Silero VAD, via LiteLLM), `oral-reading` plugin kind, word/sight-word verification, listen-first + green/honey karaoke UX, in-memory audio discard |
| **3. Fluency + memory** | Read-aloud v2 + scheduler | Forced alignment, sentence/passage mode, WCPM, spaced-repetition scheduler, decodable pipeline, parent fluency dashboard |
| **4. Growing with her** | Subjects & kinds | Math fact fluency, knowledge expeditions, number-line/fraction/trace/retell/mission kinds, spelling track, portfolio, diagnostic upgrade |

## Divergences worth noting

- **v1 scoring engine**: ASR agent says Whisper + phonetic fuzzy match is enough for isolated words; Codex prefers a dual pass (Whisper + Montreal Forced Aligner) from day one. Resolution: ship v1 with Whisper + phoneme fuzzy match (simpler), design the service API around per-word `{status: confirmed|uncertain|skipped}` so the aligner slots in for v2 without a contract change.
- **In-browser ASR** (transformers.js/WASM) is the strongest privacy story but sacrifices forced-alignment tooling and is fragile on unknown hardware — revisit only if the homelab hop ever becomes a concern.
