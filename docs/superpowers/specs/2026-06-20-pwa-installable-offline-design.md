# Design: Installable, offline-capable PWA

- **Date:** 2026-06-20
- **Branch:** `worktree-feature+pwa-installable` (off `origin/main` @ `e0feb18`)
- **Status:** Design — pending review

## Problem

`kaelyns.academy` is a normal web app: it cannot be installed to a phone/tablet home
screen, it shows the browser's "no internet" error when offline, and previously-played
narration must be re-fetched every time. We want it to be a **Progressive Web App**:
installable from mobile, launching standalone (no browser chrome), resilient offline, and
able to **replay already-played audio without a network**.

## Goals

- **Installable from mobile.** Android/Chrome shows its native install affordance; iOS
  Safari "Add to Home Screen" works. App launches standalone with a warm-paper splash.
- **Offline-capable** within an honest boundary (see below): static assets cached, a
  branded offline screen instead of the dino page, and **played audio clips replay offline**.
- **Audio caching.** Pre-generated clips (`GET /audio/<locale>/<key>.*`) are cached as they
  play and served from cache on replay, including offline. Audio `Range` requests handled.
- **No regression / no new runtime deps.** Build stays `output: standalone` + Sentry; dev
  stays on native **Turbopack** (no `--webpack`); the existing audio/TTS layer is untouched.
- **Child-data posture preserved.** No authenticated/personalized HTML or RSC is ever
  persisted to a cache (the device may be shared between siblings/accounts).

## Non-goals (YAGNI)

- **Offline access to learning data / progress.** The learning flow needs session + DB +
  bounded practice synthesis; it is online-only by design. Offline shows a friendly screen.
- **"Download a whole program for offline"** (bulk audio precache). Would need an audio-key
  manifest per program + a storage budget + a download trigger — a separate feature.
- **Push notifications, background sync, web-share-target.** Not in scope.
- **Caching the `POST /api/tts` synthesis path.** POST is not Cache-API-cacheable and needs
  the Kokoro server; it *already* falls back to on-device Web Speech when unavailable.

## Offline boundary (what works, what doesn't)

| Offline | Behavior |
| --- | --- |
| Launch installed app | App shell + static assets load from cache (instant). |
| Navigate to any authed route | Branded `/~offline` page (we do **not** persist authed pages). |
| Replay an already-played clip | ✅ served from the audio runtime cache. |
| Play a *new* clip / new TTS | ❌ falls back to on-device Web Speech (existing behavior). |
| New learning content / progress | ❌ requires network (online-only by design). |

This is deliberate: online is always fresh and personalized; offline is a graceful,
data-safe degradation. We trade "browse personalized pages offline" for correctness (no
stale auth content) and privacy (nothing personal cached on a shared device).

## Current state (verified on this base)

| Concern | Where | Today |
| --- | --- | --- |
| Metadata / theme | `src/app/layout.tsx` | `metadata` (title/description/applicationName) + `viewport.themeColor = "#fdf6e9"`, `colorScheme: light`. No `manifest`, no `appleWebApp`. |
| Icons | `src/app/`, `public/` | None (no favicon, no app icons). Only decorative `*.svg` in `public/`. |
| Brand mark | `src/components/art/Mascot.tsx` | **Twinkle** — honey star (`--color-honey`) + ink outline (`--color-ink`), coral cheeks, `viewBox 0 0 120 120`. Pure SVG → icon source. |
| Design tokens | `src/app/globals.css` | Wonder Studio: paper `oklch(0.987 0.008 85)` ≈ `#fdf6e9`, honey, coral, ink. OKLCH (Satori/sharp need hex equivalents). |
| Pre-gen audio | `src/app/audio/[...path]/route.ts`, `src/content/languages/audio.ts` | `GET {AUDIO_BASE_URL}/{locale}/{audioKey}.m4a` (default base `/audio`), `cache-control: public, max-age=86400, immutable`. Same-origin proxy → MinIO. |
| On-demand TTS | `src/app/api/tts/route.ts`, `src/components/learner/narrate.ts` | `POST /api/tts` → mp3 or 303 → `/audio/...`; client blob-URL LRU. Already degrades to Web Speech. |
| Build | `next.config.ts` | `output: "standalone"`, Sentry wrap, `outputFileTracingExcludes` for `_archive`. Next 16.2.9, Turbopack default. |
| Deploy | `DEPLOY.md` / homelab | Forgejo CI → Harbor (SHA-pinned) → ArgoCD → Traefik → Cloudflare Tunnel. HTTPS at `kaelyns.academy`. Container has **no `.git`**; may run **≥1 replica**. |

## Architecture

### Packages (devDependencies, all `9.5.11`)

`@serwist/turbopack`, `serwist`, `esbuild` — the **native Turbopack** Serwist integration
(peer `next >=14`); no `--webpack` needed. Plus `sharp` (devDep, **icon generation script
only**, never imported by app/runtime code).

> Verified current: `@serwist/turbopack`, `serwist`, `@serwist/next` are all on the same
> `9.5.11` release; `@serwist/next` is the *webpack* path and is intentionally **not** used.

### File map

| File | Purpose |
| --- | --- |
| `next.config.ts` | wrap final export in `withSerwist` from `@serwist/turbopack` (keep `output: standalone` + Sentry). |
| `src/app/serwist/[path]/route.ts` | `createSerwistRoute({ swSrc:"src/app/sw.ts", additionalPrecacheEntries:[{url:"/~offline",revision}], useNativeEsbuild:true })`. Serves `/serwist/sw.js`. **`revision` = build-time SHA, deterministic fallback — NOT `crypto.randomUUID()`** (see Deploy). |
| `src/app/sw.ts` | `new Serwist({...})` — precache `self.__SW_MANIFEST` + `/~offline`, custom `runtimeCaching`, `fallbacks` → `/~offline`, `navigationPreload`, `skipWaiting`, `clientsClaim`. `addEventListeners()`. |
| `src/app/~offline/page.tsx` | Static, **no-auth**, on-brand "You're offline" screen with Twinkle. Must not import session/db. |
| `src/app/manifest.ts` | Web manifest (Next auto-injects `<link rel="manifest" href="/manifest.webmanifest">`). |
| `src/app/icon.svg` | Favicon (Twinkle SVG). File convention → auto `<link rel="icon">`. |
| `src/app/apple-icon.png` | 180×180 apple-touch (opaque paper bg). File convention → auto link. |
| `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png` | Manifest icons (generated, committed). |
| `src/components/pwa/IosInstallHint.tsx` | Dismissible iOS-Safari A2HS hint (client component). |
| `scripts/gen-icons.ts` | Render Twinkle → PNGs via `sharp`. Run once (`bun run gen:icons`); outputs committed. |
| `src/app/layout.tsx` | Wrap children in `<SerwistProvider swUrl="/serwist/sw.js">`; add `metadata.appleWebApp`; mount `<IosInstallHint/>`. |

### Service worker — `src/app/sw.ts`

Shape (from the verified `@serwist/turbopack` docs), with a **custom `runtimeCaching`**:

```ts
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin,
         RangeRequestsPlugin, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// CRITICAL: do NOT spread all of `defaultCache` — it contains page/RSC/data/API
// entries (NetworkFirst) that would persist authenticated content. Keep ONLY the
// static-asset entries, selected by an allowlist of cacheNames (verified against the
// installed `defaultCache` in impl; fail the build if an entry is unrecognized).
const STATIC_CACHE_NAMES = new Set([
  "google-fonts", "gstatic-fonts", "static-font-assets",
  "static-image-assets", "next-image",
  "static-js-assets", "static-style-assets",
]);
// (exact accessor — `e.handler.cacheName` — confirmed against the installed package in impl)
const staticCache = defaultCache.filter((e) => STATIC_CACHE_NAMES.has(e.handler.cacheName));

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Audio clips: immutable per key → CacheFirst, with Range support for <audio>.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/audio/"),
      handler: new CacheFirst({
        cacheName: "audio-clips",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new RangeRequestsPlugin(),
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
    // Static, non-personal assets only (content-hashed → deploy-safe). No pages/RSC/API.
    ...staticCache,
  ],
  // No page/RSC caching rule exists, so navigations + RSC hit the network (always fresh,
  // nothing authed persisted). When offline, the fallback serves the precached /~offline.
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});
serwist.addEventListeners();
```

> The `staticCache` allowlist is the load-bearing privacy control: it is what keeps
> authenticated HTML/RSC/API responses out of any cache. Implementation will assert the
> kept `cacheName`s against the installed `defaultCache` so a future Serwist change can't
> silently reintroduce page caching.

**Caching strategy summary**

| Request | Strategy | Why |
| --- | --- | --- |
| `/audio/*` clips (GET) | **CacheFirst** + `RangeRequestsPlugin` + `CacheableResponsePlugin([200])` + `ExpirationPlugin` | Immutable per key; `<audio>` issues `Range` → needs 206 handling; bounded growth. |
| `/_next/static/*`, fonts, images | CacheFirst / SWR (`defaultCache`) | Content-hashed filenames → deploy-safe forever. |
| Navigations + RSC (authed app) | **NetworkOnly** + `/~offline` fallback | Always fresh; **nothing personalized persisted**; offline → friendly screen. |
| `POST /api/tts` | (not handled) → network; offline → Web Speech | POST not cacheable; existing graceful fallback. |

> If `NEXT_PUBLIC_AUDIO_BASE_URL` is ever pointed at a different origin (CDN), the audio
> matcher must include that origin. Default prod is same-origin `/audio` (MinIO proxy), so
> the `sameOrigin && /audio/` matcher is correct today.

### Web manifest — `src/app/manifest.ts`

```ts
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kaelyn's Academy",
    short_name: "Kaelyn's",
    description: "A warm, adaptive learning studio for young children.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdf6e9",
    theme_color: "#fdf6e9",
    lang: "en",
    dir: "ltr",
    categories: ["education", "kids"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

`layout.tsx` adds `metadata.appleWebApp = { capable: true, title: "Kaelyn's Academy",
statusBarStyle: "default" }`. `viewport.themeColor` stays `#fdf6e9`.

### Icons — built from Twinkle

One source SVG (honey star + ink outline on warm-paper rounded square) → `sharp` renders:

| Output | Size | `purpose` / notes |
| --- | --- | --- |
| `public/icons/icon-192.png` | 192² | `any`, transparent ok |
| `public/icons/icon-512.png` | 512² | `any` |
| `public/icons/maskable-512.png` | 512² | `maskable` — Twinkle within the ≥20% safe zone on **solid paper** bg |
| `src/app/apple-icon.png` | 180² | **opaque** paper bg (iOS rounds corners / ignores alpha) |
| `src/app/icon.svg` | vector | favicon |

OKLCH tokens converted to hex for the rasterizer: paper `#fdf6e9`, honey `≈#f2c14e`,
ink `≈#3b352c`, coral `≈#e8896b` (exact values finalized against `globals.css` in impl).
Generation is a one-time committed step → **no build-time or runtime image dependency**,
and the PNGs are static (cacheable, precacheable).

### Install UX — native + iOS hint

- **Android/Chrome/desktop:** native install fires once criteria are met (valid manifest,
  192+512 icons, registered SW with a fetch handler, HTTPS — all satisfied). No prompt code.
- **iOS Safari:** never auto-prompts. `IosInstallHint.tsx` shows a small, dismissible,
  one-time Wonder-Studio banner ("Add Kaelyn's Academy to your Home Screen — tap Share ▸
  Add to Home Screen") gated by a **pure, testable** detector:
  - is iOS Safari (UA + `maxTouchPoints > 1` to catch iPadOS-as-Mac), **and**
  - not already standalone (`matchMedia("(display-mode: standalone)")` / `navigator.standalone`), **and**
  - not previously dismissed (`localStorage` flag).

  The detector lives as a pure function `shouldShowIosHint(env)` so it unit-tests without a DOM.

## Homelab / deploy considerations

The verbatim Serwist example computes `revision` via `git rev-parse HEAD` at request time
with a `crypto.randomUUID()` fallback. Both are wrong for our deploy:

1. **No `.git` in the Harbor container** → it would hit the fallback.
2. **`crypto.randomUUID()` per process** → with ≥1 replica behind a load balancer, each pod
   serves a *different* precache revision → constant SW updates / cache thrash.

**Decisions:**

- **`revision` = build-time commit SHA via env** (CI already SHA-pins the image; pass the
  commit as a build env, e.g. `NEXT_PUBLIC_BUILD_SHA` / `SOURCE_COMMIT`). Deterministic
  fallback to Next's `buildId` (or a fixed constant) — **never random**. Identical across
  all replicas of a deploy; changes exactly when a new SHA ships.
- **`output: standalone` packaging** of the `/serwist/[path]` route + SW generation
  (`useNativeEsbuild`) must be verified to work without runtime `git`/`esbuild` surprises.
  This is the **one genuine unknown** and is handled as a **verification spike up front**
  (see below). If it can't emit cleanly under standalone, fall back to a build-time static
  SW emit (`swDest: public/sw.js`) and serve `/sw.js` directly.
- **Dev** uses native Turbopack (`next dev`, the whole reason for `@serwist/turbopack`).
  Installability/offline is validated only against a production build (`bun run build &&
  bun run start`), since SW behavior in dev differs.

## Build-safety & lint posture

- `src/app/sw.ts` is a web-worker module: worker globals via `/// <reference lib="webworker" />`
  + the `declare` blocks (no `@ts-ignore`, no `eslint-disable`). Confirm ESLint flat config
  and `tsc` accept it (may need a worker-lib include for that file).
- No service connections at module top-level (the `/audio` and `/api/tts` routes already
  obey this; new files add no top-level I/O — `manifest.ts`, `sw.ts`, `/~offline` are pure).
- `sharp` is `devDependencies` only and imported solely by `scripts/gen-icons.ts`.
- Gate before merge: `bun run lint && bun run typecheck && bun run test && bun run build`.

## Testing & acceptance

**Vitest (pure helpers — no SW/DOM env):**

- `manifest.ts` → snapshot key fields (name, short_name, display, start_url, theme/background, icons).
- audio matcher → `/audio/en/x.m4a` (same-origin) cached; `/api/tts`, cross-origin, non-audio not.
- `shouldShowIosHint(env)` → true only for iOS Safari, not-standalone, not-dismissed; false for
  Android, desktop, installed, iPadOS-as-Mac without touch, previously-dismissed.
- iOS-hint dismissal persists (localStorage flag set/honored).

**Manual / Chrome DevTools (webapp-testing skill) against `bun run build && bun run start`:**

- Lighthouse PWA / "installable" passes; Application ▸ Manifest renders icons; Service Worker active.
- Offline toggle → navigation shows `/~offline` (not the dino page).
- Play a clip online → go offline → replay works from cache.
- iOS hint shows in iOS Safari simulation only; dismiss persists across reloads.

**Acceptance:** installable on Android (native) + iOS (A2HS); standalone launch with paper
splash; offline → branded screen + replayable audio; no authed page cached; full gate green.

## Verification spike (do first, before wiring icons/hint)

Stand up the minimal Serwist-turbopack path (`next.config` wrap + `serwist` route + `sw.ts`
+ `/~offline` + manifest), then confirm in a **production standalone** build:

1. `/serwist/sw.js` is served and registers (scope `/`).
2. SW builds without a runtime `git` call (revision comes from the build env).
3. App is flagged installable; `/~offline` is precached and served offline.

If (1)–(3) hold, proceed with the full design. If standalone packaging fights the
route-handler SW, switch to the static `swDest` emit fallback noted above (same `sw.ts`,
different delivery) and continue.

## References

- [@serwist/turbopack (npm, v9.5.11)](https://registry.npmjs.org/@serwist/turbopack/latest)
- [Serwist — Next.js + Turbopack guide](https://serwist.pages.dev/docs/next/turbo)
- [Next.js 16 — Turbopack default for dev & build](https://nextjs.org/blog/next-16)
