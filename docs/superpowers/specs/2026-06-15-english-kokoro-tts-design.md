# Design: Kokoro neural voice for English site narration

- **Date:** 2026-06-15
- **Branch:** `feature/english-kokoro-tts` (off `origin/main` @ `78ac8dd`)
- **Status:** Design — pending review

## Problem

Everything Kaelyn hears in the **English** program (`kaelyn-adaptive`) is spoken by the
browser **Web Speech API** (`speechSynthesis`). The system voice sounds unnatural. The
**foreign-language** program (`world-languages`) already sounds good: it plays
pre-generated neural clips — Kokoro for Spanish/Japanese/Zhuyin, MeloTTS for Korean —
served from MinIO via the `/audio` proxy, with browser TTS only as a fallback.

We want the English site narration to use the **homelab Kokoro** voice
(`af_heart`) too, while leaving the foreign-language snippets exactly as they are.

## Goals

- English narration is voiced by Kokoro `af_heart` (warm US female), not the browser voice.
- A synthesized clip for a given string is produced **at most once** and reused — never
  re-synthesized on replay. Static/canonical content is cached **durably**; truly dynamic
  one-off content is cached with **automatic cleanup**.
- All clips — warm-pass, pre-synth-on-generation, or on-demand — are addressed and served
  **consistently** through `/audio/en/<key>.mp3` keyed by content hash.
- Zero regression for foreign languages: the `useAudio` clip path and its non-English
  browser-TTS fallback are unchanged.
- Speech remains an enhancement: if Kokoro is unreachable, fall back to `speechSynthesis`.

## Non-goals

- No change to foreign-language audio (Zhuyin/Spanish/Japanese/Korean).
- No open-ended child↔LLM audio; all spoken text is still bounded + server-validated (spec §8).
- No replacement of `useDictation` (speech *recognition* for the journal compose mode).
- No new TTS engine beyond the already-deployed `kokoro-fastapi`.

## Current state (verified on this base)

| Concern | Where | Behavior today |
| --- | --- | --- |
| English module seam | `src/components/learner/speak.ts` | `speak()/canSpeak()/stopSpeaking()` — browser TTS, hardcoded `en-US`. Used by `ActivityHost.tsx`, `AppShellKid.tsx`. Already carries a TODO to swap for a server TTS route. |
| English hook seam | `src/activities/_shared/useSpeech.ts` | `useSpeech(locale)` — browser TTS, locale-aware voice pick. Used by all English Players via `ActivityChrome.tsx` (`Prompt`/`SpeakerButton`). **Also the fallback engine inside `useAudio` for foreign locales.** |
| Foreign clip path | `src/activities/_shared/useAudio.ts` + `src/content/languages/audio.ts` | Plays `{AUDIO_BASE_URL}/{locale}/{audioKey}.m4a`, falls back to `useSpeech`. **Leave untouched.** |
| Audio serving | `src/app/audio/[...path]/route.ts` | Read-only same-origin proxy → `AUDIO_ORIGIN` (MinIO). Path guard allows ≤3 safe segments. Returns 404 on miss. |
| Clip generator | `scripts/generate-audio.ts` | Dev/CI tool. Kokoro call convention: `POST ${KOKORO_URL}/audio/speech` `{model:"kokoro", input, voice, response_format, speed}`. Outputs `.m4a` via macOS `afconvert`. |
| English generation | `src/lib/ai/practice.ts` → `generatePracticeItems()` | Produces child-spoken English (`instruction`, `passage`, `questions[].prompt`, …), bounded + Zod-validated. **Pre-synth hook point.** |
| English Players | `reading-comprehension`, `sightword-game`, `math-tenframe`, `math-array`, `phonics-wordbuild`, `journal-prompt` | Speak via `ActivityChrome` → `useSpeech`. |
| Foreign Players | `lang-symbol-intro`, `lang-listen-match` | Speak via `useAudio`. **Untouched.** |
| Env | `.env.example` | `KOKORO_URL`, `AUDIO_ORIGIN`, `NEXT_PUBLIC_AUDIO_BASE_URL` (=`/audio`) already exist. |

## Architecture

### Key scheme (one function, used everywhere)

`src/lib/audio/ttsKey.ts` exports `ttsKey(text, voice, speed)`:

- `normalize(text)` = trim + collapse internal whitespace (so trivial spacing differences
  dedupe). Casing/punctuation preserved (they change prosody).
- `key = sha256(`​`${normalized}|${voice}|${speed}`​`)` → lowercase hex.
- Clip object path = `<prefix>/<key>.mp3`, where prefix is `en` (durable) or `en/cache`
  (ephemeral). Public URL = `${AUDIO_BASE_URL}/<prefix>/<key>.mp3` (served by `/audio`).

The route, the warm pass, and the pre-synth hook **all** import this one function, so a
string synthesized by any path is found by any other.

### Two-tier cache

| Tier | Object prefix | Lifetime | Used for |
| --- | --- | --- | --- |
| **Durable** | `en/<key>.mp3` | Permanent | Static/canonical UI strings (warm pass) + pre-synth-on-generation curriculum/practice. A miss becomes a permanent hit — each static string is synthesized at most once, ever. |
| **Ephemeral** | `en/cache/<key>.mp3` | MinIO lifecycle expiry (default 14 days) | Truly dynamic, one-off speech (future tutor/agent turns). Cached so an immediate replay is free, then auto-reclaimed. |

Cleanup is a **native MinIO lifecycle rule** on the `en/cache/` prefix declared in the
GitOps MinIO config — no app-side cron. Reads for both tiers go through the unchanged
`/audio` proxy (the 3-segment `en/cache/<key>.mp3` path already passes its guard).

### Server route — `POST /api/tts`

`src/app/api/tts/route.ts`, body `{ text: string, voice?: string, persist?: "durable" | "ephemeral" }`
(POST so long passages aren't capped by URL length). Per request:

1. Resolve `voice` (default `KOKORO_EN_VOICE` = `af_heart`), `speed` (`KOKORO_EN_SPEED` ≈ `0.9`),
   `prefix` (`persist` default `"durable"`). Compute `key = ttsKey(...)`.
2. **Hit:** `HEAD ${AUDIO_ORIGIN}/<prefix>/<key>.mp3` (anonymous read, no creds). Also probe
   the durable prefix for an ephemeral request (a string may already be durably warmed). On
   hit → `303 See Other → /audio/<prefix>/<key>.mp3` (browser caches the immutable GET; POST→GET is explicit).
3. **Miss:** synthesize via Kokoro (`response_format:"mp3"` → no transcode on the Linux pod),
   then **write-through** the bytes to `<prefix>/<key>.mp3` in MinIO (minio client, scoped
   write creds), then `303 → /audio/<prefix>/<key>.mp3`.
4. **Kokoro down / timeout / synth error:** `503` (no write). Client falls back to `speechSynthesis`.

Build-safe: env + network only per-request, never at module load (project non-negotiable).
A bounded in-process in-flight map dedupes concurrent identical requests so a burst doesn't
fan out N Kokoro calls for one key.

### Server util — `ensureNarration(text, opts)`

`src/lib/audio/narration.ts` (server). `ensureNarration(text, { voice?, speed?, persist? })`:
computes the key, returns immediately if the object already exists, else synthesizes and
write-throughs to the tier prefix. Idempotent and fire-and-forget-safe.

- **Pre-synth on generation:** `generatePracticeItems()` (and future tutor/report generators)
  call `ensureNarration` (durable) for each child-spoken English field
  (`instruction`, `passage`, question `prompt`s, feedback) right after generation —
  `void`-ed so it never blocks or fails the response. By the time the child taps the speaker,
  the clip is usually a warm 303 hit.
- The route's miss path reuses the same synth+write-through internals.

### Client seam — `narrate()`

`src/components/learner/narrate.ts` (client). `narrate(text, { persist?, onUnavailable }) → { cancel }`:

1. `POST /api/tts {text, persist}`; follow the `303` and play the resulting
   `/audio/en[/cache]/<key>.mp3` via an `Audio` element (mirrors `useAudio`'s element/cancel
   handling — guard against superseded plays).
2. On non-OK response, fetch error, or audio `error`/rejected `play()` → call
   `onUnavailable()` (which speaks via the existing `speechSynthesis` path). Speech never blocks the child.
3. In-session memo keyed by the normalized text (the redirected `/audio` URL from the first
   play) so replays within a session skip the POST and reuse the browser-cached clip.

Rewire the two seams to delegate, keeping their **public APIs identical** (so no Player changes):

- `speak.ts`: `speak(text)` → `narrate(text, { persist:"durable", onUnavailable: <current speechSynthesis body> })`. `stopSpeaking()` cancels the active `narrate` handle and any utterance. `canSpeak()` unchanged (capability for the fallback).
- `useSpeech.ts`: **only the English branch** (`isEnglish(locale)`) routes through `narrate`;
  non-English keeps today's `speechSynthesis` behavior verbatim, so `useAudio`'s foreign
  fallback is unaffected. `supported`/`hasVoice`/`cancel` contracts preserved.

### Warm pass — `scripts/warm-english-audio.ts`

Dev/CI tool (sibling to `generate-audio.ts`). Enumerates **static** English strings:

- activity `instruction`s and word/tile/decoy lists from `src/content/programs/kaelyn-adaptive.ts` + authored configs,
- hardcoded feedback phrases in the English Players (e.g. "That's it", "Hmm, keep looking", "You found every word"),
- canonical reading passages/titles authored in content,
- spoken digits `0`–`20` (math-tenframe count).

For each: synth via Kokoro `af_heart` (`response_format:"mp3"` → upload `.mp3`, no `afconvert`,
cross-platform) and upload to `en/<ttsKey(...)>.mp3` in MinIO via `mc`/minio client — same
seeding path used for the foreign clips. Idempotent (skip existing). This makes all current
UI narration an instant durable hit on day one.

### Phoneme overrides — `src/lib/audio/phonemes.ts` (added 2026-06-21)

Kokoro's misaki G2P mis-reads out-of-context fragments, so phonics tiles spoken in
isolation voice wrong ("ble" → "blee", lone "c" → its letter name "see"). Fix: send the
inline override `[label](/ipa/)` as the TTS `input` — misaki then voices the supplied IPA
verbatim (verified honored end-to-end on the deployed kokoro-fastapi v0.5.0; derive values
from its `/dev/phonemize`).

- `withPhonemes(label, ipa)` builds the markup (sanitizing the markup delimiters
  `[ ] ( ) /` on both sides). `wordPhonemeText(label, ipa)` / `tilePhonemeText(tile, say)`
  are the single shared override-decision helpers used by BOTH the Player and the warm pass,
  so the emitted string — and therefore its `ttsKey` — is byte-identical on each side. The
  browser-`speechSynthesis` fallback always speaks the plain label, never the markup.
- `phonics-wordbuild` config gains optional `say` (tile→IPA), `silent` (tiles voiced as
  silent — e.g. the magic-e, which still fills a slot), and per-word `ipa`. Only
  genuinely-misread tiles are overridden; citation forms are kept for short/long-vowel and
  roots lessons.
- `MAX_TTS_TEXT_LEN` (`config.ts`, 500) now caps BOTH `/api/tts` and `ensureNarration`, so
  the warm/pre-synth path can't synthesize text the route would reject (denial-of-wallet).

### Config & secrets

| Var | Scope | Value / note |
| --- | --- | --- |
| `KOKORO_URL` | server | exists; prod `http://kokoro.voice.svc.cluster.local:8880/v1` |
| `KOKORO_EN_VOICE` | server | new; default `af_heart` |
| `KOKORO_EN_SPEED` | server | new; default `0.9` |
| `AUDIO_ORIGIN` | server | exists; MinIO bucket base (anonymous read) |
| `NEXT_PUBLIC_AUDIO_BASE_URL` | client | exists; `/audio` |
| `AUDIO_S3_*` (endpoint/access/secret/bucket) | server | **new sealed secret** — scoped MinIO write creds for the route + `ensureNarration` write-through |
| MinIO lifecycle rule | infra | **new** — expire `en/cache/` after 14 days (GitOps MinIO config) |

Dependency: a MinIO/S3 client for write-through (e.g. the official `minio` JS client —
verify latest stable at implementation, per repo policy). Reads stay creds-free via `/audio`.

## Error handling

- Kokoro unreachable/slow/5xx → route `503` → client `speechSynthesis` fallback. Logged via `captureNonCritical`.
- MinIO write failure → still serve the freshly-synthesized bytes for this request (degrade to no-cache, log); never 500 the child.
- `ensureNarration` failures are swallowed (fire-and-forget) — they only cost a later on-demand synth.
- Path/SSRF: `/audio` guard unchanged; the route never proxies arbitrary paths (it only emits keys it computed).

## Testing (vitest)

- `ttsKey()` — determinism, whitespace normalization, voice/speed sensitivity, stable hex.
- Route — hit→303 (durable + ephemeral, incl. ephemeral-finds-durable), miss→synth+write-through→303, Kokoro-error→503, in-flight dedupe. Kokoro + MinIO mocked.
- `ensureNarration()` — skips when present, synth+writes when absent, swallows failures.
- `narrate()` — plays on success, calls `onUnavailable` on each failure mode, cancel supersedes.
- **Regression guard** — non-English `useSpeech` path and `useAudio` are unchanged (no `narrate`/`/api/tts` call for foreign locales).

## Sequencing

1. `ttsKey` util + tests.
2. `/api/tts` route + `ensureNarration` + tests (synth/cache/write-through/fallback).
3. Client `narrate` + rewire `speak.ts` and the English branch of `useSpeech` + tests.
4. Pre-synth hook in `generatePracticeItems` (+ future tutor/report).
5. `warm-english-audio.ts` + env/`.env.example` updates.
6. Infra (separate, non-app): `AUDIO_S3_*` sealed secret, MinIO `en/cache/` lifecycle rule.
7. Gates green: `bun run lint && bun run typecheck && bun run test && bun run build`. Then warm-pass upload, manual listen, deploy.

## Open questions

- Ephemeral TTL — 14 days assumed; adjust on review.
- Default `persist` for client `narrate` — `durable` (canonical UI is the common case); the tutor/agent surface (P5) must pass `ephemeral` explicitly when it lands.
