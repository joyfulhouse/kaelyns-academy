# Kaelyn's Academy v3 — Platform Design Spec

**Date:** 2026-06-13
**Status:** Draft for review
**Author:** Claude (Opus 4.8) with Bryan Li
**Type:** Ground-up rebuild (blank slate, no tech debt carried from v2)

---

## 1. Summary

Rebuild **Kaelyn's Academy** (`kaelyns.academy`) from scratch as a **pluggable, multi-user, AI-agentic children's learning platform** with an impeccable "Wonder Studio" design, on the latest Next.js, deployed to the **homelab k3s + CNPG** infrastructure via GitOps.

The first content program is the **Summer Bridge: Kindergarten → 1st Grade** curriculum (already authored in `docs/curriculum/summer-k-to-grade1/`). Bryan's daughter (just finished K, on-track) is the pilot learner; the platform is built as a reusable product that could serve other families.

**Three pillars:**
1. **Pluggable programs** — structured curricula (Program → Unit → Lesson → Activity) built from reusable, skill-tagged activity-type plugins.
2. **Agentic tutoring** — an LLM agent (via the homelab **LiteLLM** gateway) that adapts difficulty, recommends the next activity, generates fresh practice, and writes parent progress reports — bounded and kid-safe.
3. **Operational parity with askcv.ai** — the same `/ship` + sprint workflow and the same in-app bug-reporting + Sentry mechanism, adapted from Vercel/Neon to homelab GitOps/CNPG.

**Build mode:** Full big-bang (complete platform, deploy once at the end), executed in internal phases for sane sequencing.

---

## 2. Goals & non-goals

### Goals
- A delightful, accessible learning experience for a 5–7 year old that a parent trusts.
- Author once, reuse everywhere: adding a new program is content + existing plugins, not new app architecture.
- Adaptive, safe AI tutoring that augments (never replaces) the structured curriculum.
- Parent accounts with multiple child profiles; per-child progress + skill state.
- Self-hosted on the homelab with the family's standard GitOps, backups, and observability.
- Same engineering rigor as askcv.ai: review gates, sprint execution, bug triage, canary deploys.

### Non-goals (v3)
- No public marketplace / third-party program authoring UI (content authored in-repo for now).
- No open-ended free chat between a child and an LLM (safety — see §8).
- No payments/billing in v3 (single household; revisit if productized).
- No native mobile app (responsive web, installable PWA is acceptable).

---

## 3. Learner & product context

- **Pilot learner:** on-track end-of-K (~5–6 yo). Calibration & curriculum detail live in `docs/curriculum/summer-k-to-grade1/`.
- **Primary user roles:**
  - **Parent/guardian** (account owner): manages child profiles, reviews progress reports, configures program enrollment and safety/time limits.
  - **Learner** (child): picks their profile (no PII, no login credentials of their own), does lessons/activities. Big-button, low-text, audio-supported UI.
  - **Admin** (Bryan): content/program management, platform config. May reuse homelab Authentik SSO; parents use in-app Better Auth.

---

## 4. Tech stack (locked unless noted)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (latest), App Router, RSC + Server Actions | `proxy.ts` convention; all request APIs async. Mirrors askcv.ai patterns. |
| Language | TypeScript (strict) | No `@ts-ignore`. |
| Package manager | **bun** | Always. |
| Styling | **Tailwind CSS v4** + bespoke component system | Static class maps only (JIT-safe). "Wonder Studio" tokens (§11). |
| UI primitives | shadcn/ui (heavily customized) + Radix | Never default state. |
| Icons | **Phosphor** | No Lucide. (Matches askcv.ai rule.) |
| Motion | Motion (Framer Motion successor) | Tasteful, performance-budgeted; respects `prefers-reduced-motion`. |
| DB | **PostgreSQL via CNPG** (`kaelyns-academy-db`, amd64-pinned) | Barman→B2 backups. |
| ORM | **Drizzle ORM** | Migrations in `drizzle/`. Matches askcv.ai. |
| Auth | **Better Auth** (Drizzle adapter) | Parent accounts; child profiles are sub-entities, not auth principals. |
| AI gateway | **LiteLLM** (OpenAI-compatible) | `LITELLM_URL=http://litellm.litellm.svc.cluster.local:80/v1`, `LITELLM_API_KEY` via sealed-secret. Tutor uses a **Claude route added to LiteLLM** (Haiku 4.5 fast turns / Sonnet 4.6 richer generation); model names are config, via the OpenAI-compatible client. |
| Voice (TTS/STT) | Provider abstraction | Candidates: Deepgram (skill available), browser SpeechSynthesis fallback, or a homelab TTS. Decided at the agentic phase. |
| Storage | Object storage for media/uploads | Reuse B2/S3 pattern or in-cluster MinIO; child-work images, audio. (Confirm in plan.) |
| Cache | Redis (optional) | Falls back to in-memory. |
| Error monitoring | **Sentry** (`@sentry/nextjs`) | client/server/edge; `process-sentry` triage flow. |
| Hosting | **k3s homelab** via ArgoCD GitOps | Harbor registry, Traefik, cert-manager, Cloudflare Tunnel for the external domain. |

> **Why LiteLLM, not Vercel AI Gateway:** askcv.ai uses Vercel's gateway because it's on Vercel. This app is self-hosted, so it targets the homelab LiteLLM gateway (already serving frigate, stash-trigger, homelab-portal). Same "never call provider SDKs directly — go through the gateway" principle, different gateway. A thin `@/lib/ai/models` module wraps the OpenAI-compatible client so model routing is config, not code.

---

## 5. Content model (the "pluggable programs" core)

A program is **data**, rendered by **reusable activity-type plugins**. Hierarchy:

```
Program  (e.g. "Summer Bridge: K→1")
  └─ Unit  (e.g. Week 2: Under the Sea)
       └─ Lesson  (e.g. Tuesday)
            └─ Activity  (e.g. "ch digraph word build")
                 - type: "phonics-wordbuild" | "sightword-game" | "math-manipulative"
                          | "journal-prompt" | "reading-retell" | "project-checklist" | ...
                 - skillTags: ["phonics.digraphs"]
                 - standardTags: ["CCSS.RF.1.3"]
                 - config: { ...type-specific payload... }
                 - band: "ready" | "stretch"
```

**Drizzle entities (sketch):**
- `program(id, slug, title, description, age_band, status, ...)`
- `unit(id, program_id, order, title, theme, big_idea, ...)`
- `lesson(id, unit_id, order, title, day_label, ...)`
- `activity(id, lesson_id, order, type, title, skill_tags[], standard_tags[], band, config jsonb)`
- `skill(id, slug, domain, label, ready_indicator, stretch_indicator)` — the rubric from `assessment-checklists.md`
- `learner(id, account_id, display_name, avatar, birth_month, settings jsonb)`
- `enrollment(id, learner_id, program_id, started_at, status)`
- `attempt(id, learner_id, activity_id, started_at, completed_at, score, response jsonb)`
- `skill_state(id, learner_id, skill_id, state: not_yet|emerging|solid, band, updated_at, evidence jsonb)`
- `checkpoint_result(id, learner_id, program_id, kind: baseline|mid|final, results jsonb, taken_at)`

**Seeding:** A `content/programs/summer-k-to-grade1/` source (MDX or typed TS modules) is authored from the existing curriculum docs and loaded into the DB via a seed script. The docs remain the human-readable source of truth; the seed is the machine representation.

### Activity-type plugin contract
Each activity type is a self-contained module:
```ts
interface ActivityType<Config, Response> {
  type: string;                       // "phonics-wordbuild"
  schema: ZodSchema<Config>;          // validates activity.config
  Player: React.FC<ActivityPlayerProps<Config, Response>>;  // the interactive UI
  score(config: Config, response: Response): ActivityScore;  // skill evidence
  skillsAffected(config: Config): SkillTag[];
}
```
A registry maps `type → ActivityType`. New programs reuse existing types; new pedagogy = new plugin. This is the extension seam that makes programs "pluggable."

**Initial activity types (from Program 01 needs):** phonics word-build, digraph/blend sort, sight-word flashcard/game, decodable reader + retell, math manipulative (ten-frame / base-ten / number line), math fact game, journal prompt (draw + write), project checklist, assessment checklist.

---

## 6. Agentic tutoring

A **server-side agent** (LiteLLM, tool-use) that operates over the content + skill model. It does NOT free-chat with children.

**Capabilities:**
1. **Next-best-activity** — given a learner's `skill_state` + recent `attempt`s + `checkpoint_result`s, recommend the next activity (or generate a targeted practice set) within the enrolled program.
2. **Adaptive practice generation** — produce fresh items for an activity type within strict schemas (e.g., new CVC words for the current phonics focus, new addition problems within the current band). Output validated against the activity-type `schema` before render — never raw model text to the child.
3. **Parent progress reports** — weekly natural-language summary from `attempt`/`skill_state`/`checkpoint_result`: wins, what to reinforce, suggested focus. Maps to the checkpoint rubric.
4. **Read-aloud / voice** (optional) — TTS for prompts and decodable text; optional speech scoring later.

**Architecture:**
- `@/lib/ai/agent` — orchestration (tool definitions, guardrails).
- Tools are **typed functions over our own DB/content** (e.g., `getSkillState`, `listActivities`, `generatePracticeItems(type, band)`), not open web/chat.
- All model I/O via `@/lib/ai/models` → LiteLLM. The tutor's route is **Claude via LiteLLM** (Haiku 4.5 for fast turns; Sonnet 4.6 for richer generation/parent reports); model names are config. Requires an Anthropic key provisioned in the LiteLLM config + a sealed-secret, exposed as named routes (e.g. `kaelyn-tutor-fast`, `kaelyn-tutor-rich`).
- Per-learner + per-household **cost/usage tracking** and rate limits (mirrors askcv.ai cost-control discipline).

---

## 7. Multi-user & auth

- **Better Auth** with Drizzle adapter. Auth principal = **parent account** (email/password + passkey optional).
- **Child profiles** are sub-entities of an account (no child credentials, no child email). Child "login" = pick avatar on the household device; optional parent PIN to exit to parent area.
- **Tenancy:** every learner-scoped query is scoped by `account_id` (a `withAccount()` helper analogous to askcv.ai's `withTenant()`).
- **Roles:** `parent` (manage profiles, view reports, configure), `admin` (Bryan: content/platform). Authentik SSO optional for admin.

---

## 8. Safety, privacy & child-data posture (NON-NEGOTIABLE)

Children's data raises the bar. Design rules:
- **Data minimization:** no child PII beyond a display name + birth month (for age-banding). No child email, no behavioral ad tracking, no third-party analytics on child surfaces.
- **No open-ended child↔LLM chat.** All AI surfaces a child sees are **bounded** (validated practice items, TTS of approved text, structured hints from a fixed menu). Generation is server-side and schema-validated before render.
- **Parental control:** parent configures enrolled programs, daily time limits, and whether AI features are on. Parent can export/delete a child profile and all its data.
- **COPPA-minded** even for a single household, so productization is clean later: verifiable parental consent gate, clear data inventory, retention policy.
- **Content provenance:** generated practice items are logged with the prompt/model for audit; a parent-visible "what the AI made" trail.
- **Secrets:** LiteLLM key, Sentry DSN, auth secrets via **sealed-secrets** in `k3s-infra` (never committed plaintext).

---

## 9. Bug reporting & feedback mechanism (ported from askcv.ai)

Same shape as askcv.ai, adapted to CNPG. Two ingestion paths feed one work queue that the sprint system consumes.

### 9a. In-app feedback widget
A widget (parent-facing surfaces; kid surfaces get a simplified "tell a grown-up" → parent) captures:
- free-text + optional category
- **screenshot(s)** (object storage)
- **browser diagnostics**: JS errors, failed requests, console entries, navigation history, and **element selection** (`selector` + `parentPath`) for "this thing here" reports
- conversation/context

Writes a row to **`work_items`** (schema mirrors askcv.ai):
```
work_items(
  id, account_id, page_url, category(bug|ux|feature_request|performance|content|other),
  title, description, screenshot_urls jsonb, status(new|reviewed|resolved|wontfix),
  conversation_history jsonb, metadata jsonb,            -- diagnostics, elementSelection
  dev_status(triage|backlog|sprint|in_progress|in_review|done|wontfix),
  sort_order, sprint_id, source(human|agent), priority(p0..p3), effort(xs..xl),
  strategic_alignment, ai_*_suggestion, ai_scoring_rationale,
  checked_out_by, checked_out_at, plan_path, milestone_tag, created_at, updated_at
)
sprints(id, name, status(planning|active|completed), milestone_tag, start_date, end_date, capacity, notes, ...)
```
(Optionally `support_tickets` with `sprint_id` FK for parent support requests, as askcv.ai migration 0053/0054 did.)

### 9b. Sentry
- `@sentry/nextjs` client/server/edge instrumentation; `NEXT_PUBLIC_SENTRY_ENVIRONMENT` tiering (dev/staging/prod).
- Structured error hierarchy: `logger.error()` (alert) vs `captureNonCritical()` (warning) vs `ValidationError` (user error, not sent).
- `process-sentry` skill: triage via `sentry` CLI → classify (fixable/noise/stale-client/dead-code/ambiguous) → fix in worktree → resolve.
- `/api/health` schema-drift canary (503 if a critical column is missing) — drives the deploy canary.

### 9c. Agent-created items
`work-item` skill: monitoring/log/review findings inserted to `work_items` from a `system` account with AI scoring — same as askcv.ai.

---

## 10. Dev workflow & operations (ported + adapted)

Bring the askcv.ai `.claude/` skills into `kaelyns-academy/.claude/`, adapting deploy/DB specifics:

| Skill/command | Keep as-is | Adapt |
|---|---|---|
| `work-item` | Scoring, dedup, schema | DB access → CNPG via `scripts/db.sh` (psql to `kaelyns-academy-db-rw`) |
| `sprint`, `process-sprint` | Wave-based parallel worktree agents, parallel-review/sequential-merge, build gate | DB → CNPG; ship step → homelab deploy |
| `sprint-plan`, `sprint-loop` | Backlog→sprint scoring/looping | DB → CNPG |
| `process-sentry` | Triage flow, `sentry` CLI | org/project = kaelyns-academy |
| **`ship`** | Review gates (Opus+Codex+Gemini ×2), simplifier, **impeccable critique**, knip dead-code, `.merge-ready` attestations, docs gate | **Deploy half fully rewritten** (see below) |

### `/ship` deploy half — homelab GitOps (replaces Vercel)
1. `bun run typecheck && bun run lint && bun run build` (build catches Next compile errors tsc misses).
2. Pre-PR + post-PR 3-reviewer gates, simplifier, impeccable critique (frontend), tests, knip — unchanged.
3. Merge to `main` with `.merge-ready/` attestations.
4. **Deploy = git push, not `vercel deploy`:**
   - Image: `homelab/docker/kaelyns-academy/Dockerfile` → **Forgejo Actions** builds → **Harbor** `registry.joyful.house/homelab/kaelyns-academy:<sha>`.
   - CI pins `<sha>` into `k3s-infra/k8s/kaelyns-academy/deployment.yaml` → **ArgoCD** auto-syncs (~30s) → rolling update.
   - **Migrations before traffic:** run Drizzle migrations against `kaelyns-academy-db` as a **pre-sync Job / init step** before the new pods take traffic (CNPG analog of askcv.ai's migrate-before-flip). Expand-only/backward-compatible migrations.
5. **Canary:** poll `https://kaelyns.academy/api/health` (+ key routes) and check Sentry for new errors in the 5 min post-roll. On failure: `kubectl rollout undo` / pin previous SHA in `k3s-infra` (ArgoCD rolls back). Document in `DEPLOY.md`.
6. Branch/worktree cleanup — unchanged.

> A small `scripts/db.sh` wrapper (psql against the CNPG `-rw` service, with a printed env banner) replaces askcv.ai's Neon wrapper so the sprint/work-item SQL ports with minimal edits.

---

## 11. Design direction — "Wonder Studio" + impeccable

**Art direction:** playful-premium. Warm tactile palette, organic rounded shapes, custom illustration + a friendly mascot, generous whitespace; a high-end children's-book feel with app polish. Joyful but never cluttered or babyish.

- **Color:** warm neutral base; a small, calibrated accent set (not a primary-color circus). Per-program theming (Ocean week ≠ Space week) layered on a stable shell.
- **Type:** a rounded, friendly display face + a highly legible body face; large sizes, dyslexia-friendly options, strong contrast (WCAG AA+).
- **Motion:** delightful micro-interactions (earn a star, sticker pop) within a strict performance budget; `prefers-reduced-motion` respected.
- **Two surfaces, two voices:** **kid surface** (big tap targets, audio-first, minimal text, forgiving) vs **parent surface** (calm, information-dense, trustworthy — closer to askcv.ai's adult polish).
- **Execution via the `impeccable` skill:** a `PRODUCT.md` + `DESIGN.md` define the normative design system (closed shell vocabulary, static class maps, semantic palette, icon weights, anti-references). The `/ship` impeccable critique gate enforces it on every frontend PR — same mechanism as askcv.ai.

Mockups of Wonder Studio (kid home, a lesson/activity, parent dashboard) to be produced and approved before component build (browser visual companion available).

---

## 12. Deployment topology (homelab)

- **Namespace:** `kaelyns-academy` (note: a `kaelyn` ns exists for kaelyn.ai — keep separate).
- **App:** Deployment (amd64), Service, **Traefik IngressRoute** on internal host (`kaelyns-academy.k3s.joyful.house`).
- **External domain:** `kaelyns.academy` via **Cloudflare Tunnel** (add to `cloudflared` configmap → Traefik), TLS at Cloudflare edge. Cloudflare DNS for the apex + `www`. (Internal `*.joyful.house` wildcard cert does NOT cover this domain — tunnel is the path, same as kaelyn.ai.)
- **DB:** CNPG `Cluster kaelyns-academy-db` (**amd64-pinned** — arm64 CNPG is broken here), `nfs-k3s` storage, `ObjectStore` + `ScheduledBackup` (Barman→B2).
- **Secrets:** sealed-secrets (`kaelyns-academy-litellm`, `-db-creds`, `-sentry`, `-auth`).
- **Registry/CI:** Harbor + Forgejo Actions (`homelab/docker/kaelyns-academy/` + `.forgejo/workflows/build-kaelyns-academy.yml`, copy from comfyui/homelab-portal).
- **GitOps:** `k3s-infra/k8s/kaelyns-academy/` (kustomization) + `k3s-infra/k8s/argocd/applications/kaelyns-academy.yaml`. Reference app to clone: **`homelab-portal`**.

---

## 13. Repository strategy

- Rebuild in place at `websites/kaelyns-academy/` (blank slate). Preserve `docs/curriculum/` (already written) and `docs/specs/`. Archive v2 source under `_archive/` rather than deleting, so history is available but out of the way.
- Bring `.claude/` skills/commands (ship/sprint/work-item/process-*) into the project, adapted per §10.
- `CLAUDE.md` for the project: stack table, task-routing docs (FRONTEND/BACKEND/BRAND/etc. like askcv.ai), conventions (Phosphor, withAccount, models-via-LiteLLM, build-before-merge).

---

## 14. Build phases (big-bang delivery, internal sequencing)

All ships at the end, but executed in dependency order:

- **P0 — Foundation:** repo scaffold (Next 16, Tailwind v4, Drizzle, Better Auth, Sentry), CLAUDE.md + docs skeleton, `.claude/` skills ported, CI + k3s-infra manifests + CNPG + Cloudflare tunnel (deployable "hello world" behind the curtain).
- **P1 — Content model & seed:** Drizzle schema, activity-type registry, seed Program 01 from curriculum docs.
- **P2 — Design system:** Wonder Studio tokens, shell components, `PRODUCT.md`/`DESIGN.md`, impeccable wired into ship. Mockups approved.
- **P3 — Learner experience:** kid surface — program/unit/lesson navigation, activity players (the initial plugin set), progress + skill_state, checkpoints.
- **P4 — Parent experience:** accounts, child profiles, enrollment, progress dashboard, safety/time controls, data export/delete.
- **P5 — Agentic layer:** LiteLLM client, next-best-activity, adaptive generation (schema-validated), parent reports, optional voice. Cost tracking + rate limits.
- **P6 — Bug reporting & ops:** feedback widget + `work_items`/`sprints` + Sentry + `/api/health`; verify the sprint/ship loop end-to-end.
- **P7 — Hardening & launch:** a11y audit, performance budget, security/privacy review, backups verified, then `/ship` to production.

---

## 15. Open questions / risks
- **Voice provider** (Deepgram vs browser vs homelab TTS) — decide in P5.
- **Object storage** for child media (B2 vs in-cluster MinIO) — decide in P0/P1.
- ~~**LiteLLM model routing**~~ — **DECIDED 2026-06-13:** add a **Claude route** to LiteLLM for the tutor (Haiku 4.5 fast / Sonnet 4.6 rich). Action item: provision an Anthropic key in the LiteLLM config + sealed-secret, expose as named routes.
- **Authentik vs Better Auth** boundary — Better Auth for parents (public product); Authentik optional for admin only.
- **arm64 constraint** — app can run on arm64, but CNPG must be amd64-pinned; confirm node capacity.
- **Cloudflare account** ownership of `kaelyns.academy` DNS — confirm it's in the same CF account as the tunnel.

---

## 16. Mapping to deliverables
- ✅ **Curriculum (Program 01)** — authored: `docs/curriculum/summer-k-to-grade1/`.
- ⏳ **This spec** — under review.
- ⏭ **Implementation plan** — via `superpowers:writing-plans` after spec approval.
- ⏭ **Build** — phases P0–P7, big-bang, shipped via the ported `/ship` to the homelab.
