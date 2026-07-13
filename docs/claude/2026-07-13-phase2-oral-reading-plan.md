# Phase 2 — Oral Reading Verifier (read-aloud v1) — Implementation Plan

Date: 2026-07-13. Follows the Phase 1 "One Big GO" ship (PR #58/#59, live at c9f64f5).
Source design: `docs/claude/2026-07-12-growth-roadmap-research.md` §"Consensus flagship".

## Goal (v1 scope)

A new `oral-reading` activity kind: the child sees + hears a KNOWN target (single word →
short sight-word/phonics phrase), taps one big mic button, reads it aloud, and the app
verifies it — green "You read it!" or honey "I couldn't quite hear that — try again or
ask a grown-up." **Never red, never blocked, always allowed to move on.**

Out of scope for v1 (v2 later): sentences/passages, forced alignment, karaoke
highlighting, WCPM, per-phoneme GOP scoring.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| STT engine | faster-whisper `small.en`, int8, CPU | 2–10s clips transcribe <1s on amd64; proven on this cluster (camera-transcriber runs large-v3 int8 on server0) |
| Service shape | FastAPI, OpenAI-compatible `POST /v1/audio/transcriptions` + `GET /health` | LiteLLM passthrough + OpenAI SDK both expect this shape |
| Endpointing | Silero VAD server-side (trim leading/trailing silence); client records ≤ ~8s | She never has to hit "stop" precisely; prefer prebuilt wheels (pysilero-vad SIGILL war-story in camera-transcriber pyproject) |
| Routing | **Via LiteLLM** — new `model_list` entry `kaelyn-stt` with `mode: audio_transcription`, `api_base: http://kaelyn-stt.voice.svc.cluster.local:8000/v1` | "All AI via the LiteLLM gateway" non-negotiable; app reuses existing `LITELLM_URL`/`LITELLM_API_KEY` → **zero new app secrets** |
| Placement | CPU on **server0** (16-core Zen5, 64 GB, `storage=true` toleration, mostly idle) | Avoids 4090 contention on server3; same node as the proven whisper worker; model cache hostPath `/srv/k3s/whisper-models` |
| Image | Homelab-built: `homelab/docker/kaelyn-stt/` → Forgejo workflow → Harbor `registry.joyful.house/homelab/kaelyn-stt:<sha>@digest` → auto-pin in k3s-infra | Same pipeline as camera-transcriber/melotts-kr; never `:latest` in manifests |
| Privacy (§8/COPPA) | Audio processed **in-memory and discarded** at every hop (route handler, LiteLLM passthrough, STT service); persist only derived `{matched, heardSomething}`-shaped results; no transcripts stored, no transcripts shown to the child verbatim | COPPA 2025: audio used only to respond, never retained |
| Parent gate | New per-learner `oralReading` setting, **default OFF**, toggled in parent settings, **enforced server-side** in the STT route (same pattern as `aiPractice` in `/api/practice`) | Mic is sensitive; server-authoritative like the two existing AI gates |
| Scoring vs transcript | **Never raw string-compare.** Forgiving match server-side: normalize (lowercase, strip punctuation, collapse whitespace, number/word folding), accept exact, contained, homophone-table, or bounded edit-distance (scaled by target length). Result is tri-state: `matched` / `unclear` / `no-speech` — no "wrong" state surfaces to the child | 6yo WER up to ~35%; false "wrong"s are demoralizing |
| Generability | **Not AI-generable** (no `KIND_BRIEF` entry) — targets are known authored words | Premise is verification of known text; keeps `generatePracticeItems` auto-refusing it |
| Mic/service fallback | Mic denied, no getUserMedia, service down, or gate off → player degrades to listen + "ask a grown-up to listen" self-confirm; completing that path still scores forgivingly (≥1 star), never lost stars | Design doc requirement |

## Workstream A — `kaelyn-stt` service (homelab repo)

Create `homelab/docker/kaelyn-stt/`:
- `server.py` — FastAPI. `POST /v1/audio/transcriptions` (multipart `file` + optional
  `model`, `language`; accepts webm/opus from MediaRecorder — decode via ffmpeg/PyAV),
  Silero VAD trim, faster-whisper small.en int8, returns OpenAI shape `{"text": ...}`.
  Reject payloads > ~2 MB / > ~15s decoded. `GET /health` returns 200 once the model is
  loaded. No disk writes for audio (tmpfs/in-memory only). Optional `initial_prompt`
  passthrough of the expected word to bias decoding is fine (helps children's speech) —
  accept an OpenAI `prompt` form field.
- `pyproject.toml` — uv, Python 3.13; copy the torch-first layer-split + wheel guidance
  from `homelab/docker/camera-transcriber/`.
- `Dockerfile` — `python:3-slim`, `uv pip install --system`, layer-split (torch → rest),
  ffmpeg installed, non-root, `MODEL_DIR=/models` env for the mounted cache.
- `homelab/.forgejo/workflows/build-kaelyn-stt.yml` — clone of
  `build-camera-transcriber.yml`: sha tag → Harbor push (`robot$ci-push`) → verify digest →
  sed-pin `k3s-infra/k8s/voice/kaelyn-stt.yaml` → commit to main → ArgoCD rolls.

## Workstream B — manifests + gateway (k3s-infra repo)

- `k8s/voice/kaelyn-stt.yaml` — Deployment + ClusterIP Service, ns `voice`, port 8000.
  `nodeSelector: kubernetes.io/hostname: server0` + `kubernetes.io/arch: amd64`,
  `tolerations: storage=true`, `imagePullSecrets: harbor-registry`, model cache hostPath
  `/srv/k3s/whisper-models` mounted at `/models`, req cpu 500m/mem 1.5Gi limit 4Gi,
  `/health` startup+readiness `failureThreshold: 30`, `strategy: Recreate` (model RAM).
  Image digest-pinned (CI bumps it); add the renovate marker comment like melotts.
- `k8s/voice/kustomization.yaml` — add `kaelyn-stt.yaml`.
- `k8s/litellm/configmap.yaml` — append model entry:
  `model_name: kaelyn-stt`, `litellm_params: {model: openai/whisper-small-en, api_base:
  http://kaelyn-stt.voice.svc.cluster.local:8000/v1, api_key: none, mode:
  audio_transcription}` (exact param names per LiteLLM audio_transcription docs; verify
  passthrough of the `prompt` field or accept dropping it — `drop_params: true` is set).

## Workstream C — app (`kaelyns-academy` repo) — per app-scout build map

Create:
- `src/activities/oral-reading/logic.ts` — schema alias of new `oralReadingConfig`;
  `OralReadingResponse` (attempt count + per-attempt tri-state result + fallback-used
  flag; **no transcript field**); `score()` via `_shared/scoring.ts` forgiving ladder
  (finish ⇒ ≥1 star; matched-first-try ⇒ 3); `skillsAffected()` from config `skillTag`
  (must be ⊆ authored skillTags — content.test tripwire); `validateGenerated` structural.
- `src/activities/oral-reading/Player.tsx` — listen-first (auto `useSpeakOnce` of the
  target via Kokoro + replay SpeakerButton), huge mic button (kid size), MediaRecorder
  ≤8s with visual "I'm listening" state, POST blob to `/api/oral-reading`, green/honey
  feedback (Wonder Studio tokens; never red), honey path offers replay-model + retry +
  "ask a grown-up listened" fallback confirm + always "Keep going"; mic unavailable/
  denied/gate-off ⇒ straight to fallback mode. Deterministic, static class maps,
  Phosphor `MicrophoneIcon`.
- `src/activities/oral-reading/logic.test.ts` + matcher unit tests.
- `src/lib/ai/transcribe.ts` — server-only; lazy env (`LITELLM_URL`/`LITELLM_API_KEY`),
  multipart POST to `${LITELLM_URL}/audio/transcriptions` with `model: "kaelyn-stt"`,
  `AbortSignal.timeout(15_000)`; returns raw text to the route only.
- `src/lib/ai/oralReadingMatch.ts` — pure forgiving matcher (normalize, exact/contains/
  homophones/edit-distance bounded by length) + unit tests. Server-side only.
- `src/app/api/oral-reading/route.ts` — order: rate-limit (reuse `resolveRateLimit`/
  `checkRateLimit` w/ account+anon policies like `/api/tts`) → size guard (~2 MB) →
  auth/learner resolution + **`oralReading` setting enforcement** (mirror
  `/api/practice`; guests: allowed only if we decide guest oral-reading is OK — v1: NO,
  guests get the fallback path; route returns 403 for guests) → call transcribe →
  match → return `{result: "matched"|"unclear"|"no-speech"}` only. `captureNonCritical`
  on errors; service failure returns `{result: "unavailable"}` (player falls back).
- e2e `e2e/specs/oral-reading.spec.ts` — deep-link authored activity; assert
  listen-first render + mic-fallback path deterministically; mock matched path via
  `page.route("**/api/oral-reading", …)` where a signed-in flow is exercised.

Touch:
- `src/content/activity-configs.ts` (+`oralReadingConfig`, register in
  `ACTIVITY_CONFIG_SCHEMAS`), `src/content/types.ts` (Activity union),
  `src/activities/index.ts` (register), `src/components/learner/activityMeta.ts`
  (icon/label), `src/content/skills.ts` (use existing `reading.fluency.*` /
  `word.sightWords` tags; add a skill only if needed).
- `src/lib/content/config.ts` `learnerSettingsSchema` + parent
  `SettingsForm.tsx` — `oralReading` switch, default off, copy explains mic use.
- `src/content/programs/kaelyn-adaptive.ts` — a small authored set of oral-reading
  activities on already-taught sight words (satisfy content.test: ids unique, tags
  resolve, skillsAffected ⊆ skillTags). NOTE Word Study tripwire memory: don't touch the
  three reading-comprehension activities there.
- Post-merge: prod `seed-content` re-run required (DB-preferred curriculum).

### Build tripwires + gotchas (land atomically)

Adding a kind trips **three** compile/test guards that must all be satisfied in the same change, or CI/the build fails:
1. `src/content/types.ts` `Activity` union + `ACTIVITY_CONFIG_SCHEMAS` (`activity-configs.ts`) — the schema keys drive the `ActivityKind` type.
2. `src/activities/index.ts` `registerActivityType(oralReading)` — the orphan-guard test `src/activities/index.test.ts` asserts *every* kind in `ACTIVITY_CONFIG_SCHEMAS` has a registered, well-formed plugin (schema landing without a Player → test fails, not just a silent "coming soon").
3. `src/components/learner/activityMeta.ts` — `ACTIVITY_META` is a `Record<ActivityKind, …>`; a missing entry fails `tsc`.

Other load-bearing conventions surfaced by the scout:
- **`skillsAffected` ⊆ authored `skillTags`** is enforced by `src/content/content.test.ts` (and for baseline placement, `skillsAffected == skillTags`). Derive the tag from config like `sightword-game`'s optional `skillTag`, don't hardcode.
- **`"use server"` no type re-export** (memory: `use-server-no-type-reexport`): if `transcribe.ts`/the route is a `"use server"` module, do NOT `export type { … }` from it — Next registers re-exported types as runtime server refs → a `ReferenceError` that passes tsc/lint/build and only breaks at runtime (caught previously only by e2e). Put shared types in a plain module and inline-`export type` where defined.
- **Provenance is display-only** (memory: `provenance-client-echo-by-design`): if any gen/route metadata is echoed, it's forgeable display metadata, not a gate — the §8 mic + enrollment checks are the authoritative, server-side gate.
- The existing forgiving-scoring helpers live in `src/activities/_shared/scoring.ts`; the host (`ActivityHost.tsx` → `recordAttemptAction`) already persists stars + skill evidence + star ledger from the returned `ActivityScore`, so **no new persistence code** is needed — just ensure the recorded `response` carries no transcript/audio (§8).

## Sequencing

A and B land first (service must exist before LiteLLM route is useful; manifests inert
until image pushed — CI pins on first build). C is independent (falls back gracefully)
and ships through the normal gated app pipeline. End-to-end smoke: record a clip →
`curl` LiteLLM `/audio/transcriptions` → then in-app.

## Risks / open items

- LiteLLM `audio_transcription` passthrough of webm/opus multipart + `prompt` field —
  verify early with a curl; if the gateway mangles audio uploads, fall back to direct
  service wiring (Kokoro precedent) and document the deviation.
- `small.en` accuracy on a 6yo voice — the forgiving matcher + `prompt` biasing is the
  mitigation; if it bites, try `medium.en` int8 (server0 has headroom) before any GPU.
- server0 hostPath model cache dir must exist (`/srv/k3s/whisper-models` already used by
  camera-transcription — reuse it).
