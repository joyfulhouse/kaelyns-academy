# PWA: Installable + Offline-Capable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `kaelyns.academy` an installable PWA that launches standalone, shows a branded offline screen instead of the browser error, and replays already-played audio offline.

**Architecture:** Serwist via the native Turbopack integration (`@serwist/turbopack`) serves a service worker from a route handler. The SW precaches the app shell + a static `/~offline` page, runtime-caches `/audio/*` clips (CacheFirst + Range) and `/_next/static/*` assets (CacheFirst), and leaves navigations/RSC/API network-only so **no authenticated content is ever cached**. Icons are built once from the existing Twinkle mascot. Install is native on Android/desktop plus a dismissible iOS "Add to Home Screen" hint.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript (strict), Tailwind v4, Phosphor icons, `@serwist/turbopack` + `serwist` + `esbuild`, `sharp` (icon generation only), Vitest.

## Global Constraints

_Every task's requirements implicitly include this section. Values copied from the spec + `CLAUDE.md`._

- **Spec:** `docs/superpowers/specs/2026-06-20-pwa-installable-offline-design.md` (read before starting).
- **Package manager:** `bun` ONLY. Never `npm`/`yarn`/`pnpm`.
- **Versions (verify newest on npm before adding):** `@serwist/turbopack@^9.5.11`, `serwist@^9.5.11`, `esbuild` (latest, `>=0.25`), `sharp` (latest). All four are `devDependencies`.
- **Turbopack:** Next 16 default; do NOT add `--webpack` to any script.
- **No rule-disabling:** never `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or ignore warnings — fix the root cause.
- **Build-safety:** never call `getDb()`/`getAuth()` or connect to any service at module top-level. New files here add no top-level I/O.
- **Icons:** Phosphor only (`@phosphor-icons/react`). Never Lucide.
- **Styling:** Tailwind v4 token classes from `src/app/globals.css` (e.g. `bg-paper`, `text-ink`, `text-ink-soft`, `font-display`, `shadow-lg`, `rounded-2xl`). Static classes only (JIT-safe).
- **Privacy invariant (load-bearing):** NEVER cache authenticated HTML/RSC/API responses. Only `/audio/*` and `/_next/static/*` are runtime-cached; navigations are network-only with a precached `/~offline` fallback. Do NOT import or spread Serwist's `defaultCache`.
- **Deploy:** never `:latest` in manifests; never commit plaintext secrets.
- **Pre-merge gate:** `bun run lint && bun run typecheck && bun run test && bun run build` (all green).
- **Commit trailer (every commit):** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Worktree:** all work happens in `.claude/worktrees/feature+pwa-installable` (branch `worktree-feature+pwa-installable`). Quote any path containing `~` in shell commands.

---

## Task 1: Twinkle app icons

Generate the icon set first so the manifest in Task 2 references real 192/512 PNGs (Chrome needs them to flag the app installable).

**Files:**
- Create: `src/app/icon.svg` (favicon, hand-authored vector)
- Create: `scripts/gen-icons.ts` (one-time generator)
- Modify: `package.json` (add `sharp` devDep + `gen:icons` script)
- Generate (committed): `src/app/apple-icon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`

**Interfaces:**
- Produces: static icon files referenced by `src/app/manifest.ts` (Task 2): `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/maskable-512.png`. `src/app/icon.svg` + `src/app/apple-icon.png` are Next metadata-file conventions (auto-linked).

- [ ] **Step 1: Add sharp (devDependency)**

Run: `bun add -d sharp`
Expected: `sharp` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Author the favicon `src/app/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <rect width="120" height="120" rx="26" fill="#fdf6e9"/>
  <g>
    <path d="M60 12 L73.2 41.6 L104.6 45.3 L81.4 66.7 L87.6 97.6 L60 82.2 L32.4 97.6 L38.6 66.7 L15.4 45.3 L46.8 41.6 Z"
          fill="#f2c14e" stroke="#3b352c" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="49" cy="58" r="4" fill="#3b352c"/>
    <circle cx="71" cy="58" r="4" fill="#3b352c"/>
    <path d="M51 70 q9 9 18 0" fill="none" stroke="#3b352c" stroke-width="4" stroke-linecap="round"/>
    <circle cx="43" cy="68" r="5" fill="#e8896b" opacity="0.55"/>
    <circle cx="77" cy="68" r="5" fill="#e8896b" opacity="0.55"/>
  </g>
</svg>
```

- [ ] **Step 3: Write `scripts/gen-icons.ts`**

```ts
// scripts/gen-icons.ts
// Render the Twinkle app icons from a single star design. Run once after an icon
// design change: `bun run gen:icons`. Outputs are committed; sharp is a
// devDependency and is NEVER imported by app/runtime code.
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const PAPER = "#fdf6e9";
const HONEY = "#f2c14e";
const INK = "#3b352c";
const CORAL = "#e8896b";

const STAR =
  "M60 12 L73.2 41.6 L104.6 45.3 L81.4 66.7 L87.6 97.6 L60 82.2 " +
  "L32.4 97.6 L38.6 66.7 L15.4 45.3 L46.8 41.6 Z";

/** Twinkle on an optional opaque background, scaled into `size`px. `pad` shrinks the
 *  star toward center (maskable safe zone). `bg=null` → transparent. */
function twinkleSvg(size: number, bg: string | null, pad: number): string {
  const inner = 120 * (1 - pad * 2);
  const off = (120 - inner) / 2;
  const rect = bg ? `<rect width="120" height="120" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 120 120">
  ${rect}
  <g transform="translate(${off} ${off}) scale(${inner / 120})">
    <path d="${STAR}" fill="${HONEY}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="49" cy="58" r="4" fill="${INK}"/>
    <circle cx="71" cy="58" r="4" fill="${INK}"/>
    <path d="M51 70 q9 9 18 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="43" cy="68" r="5" fill="${CORAL}" opacity="0.55"/>
    <circle cx="77" cy="68" r="5" fill="${CORAL}" opacity="0.55"/>
  </g>
</svg>`;
}

async function png(svg: string, out: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(out);
  console.log("wrote", out);
}

async function main(): Promise<void> {
  await mkdir("public/icons", { recursive: true });
  await png(twinkleSvg(192, null, 0.06), "public/icons/icon-192.png");
  await png(twinkleSvg(512, null, 0.06), "public/icons/icon-512.png");
  await png(twinkleSvg(512, PAPER, 0.22), "public/icons/maskable-512.png"); // safe zone
  await png(twinkleSvg(180, PAPER, 0.12), "src/app/apple-icon.png"); // opaque for iOS
}

void main();
```

- [ ] **Step 4: Add the `gen:icons` script to `package.json`**

In `"scripts"`, add:
```json
"gen:icons": "bun scripts/gen-icons.ts"
```

- [ ] **Step 5: Generate the icons**

Run: `bun run gen:icons`
Expected: four `wrote ...` lines; files exist at the four output paths.

- [ ] **Step 6: Verify the PNG dimensions**

Run: `file src/app/apple-icon.png public/icons/icon-192.png public/icons/icon-512.png public/icons/maskable-512.png`
Expected: PNG image data at `180 x 180`, `192 x 192`, `512 x 512`, `512 x 512` respectively.

- [ ] **Step 7: Commit**

```bash
git add src/app/icon.svg src/app/apple-icon.png public/icons scripts/gen-icons.ts package.json bun.lock
git commit -m "feat(pwa): generate Twinkle app icons (favicon, apple-touch, 192/512, maskable)"
```

---

## Task 2: Serwist/Turbopack foundation + manifest + offline page (standalone spike)

This is the **de-risk gate**: wire the whole Serwist-turbopack path and prove it installs and serves the SW under a production `output: standalone` build before building the rest.

**Files:**
- Modify: `package.json` (add `@serwist/turbopack`, `serwist`, `esbuild` devDeps)
- Modify: `next.config.ts` (wrap with `withSerwist`; expose build revision)
- Create: `src/app/serwist/[path]/route.ts`
- Create: `src/app/sw.ts` (minimal: precache + offline fallback; runtime rules added in Tasks 3–4)
- Create: `src/app/~offline/page.tsx`
- Create: `src/app/manifest.ts`
- Create: `src/app/manifest.test.ts`
- Modify: `src/app/layout.tsx` (wrap children in `SerwistProvider`; add `appleWebApp` metadata)

**Interfaces:**
- Consumes: icon files from Task 1.
- Produces: a registered SW at `/serwist/sw.js` (scope `/`); a precached `/~offline`; `manifest()` default export returning `MetadataRoute.Manifest`. `src/app/sw.ts` exports nothing (worker entry); later tasks edit its `runtimeCaching` array.

- [ ] **Step 1: Add Serwist packages**

Run: `bun add -d @serwist/turbopack serwist esbuild`
Expected: all three under `devDependencies` at `^9.5.11` (serwist family) / latest esbuild.

- [ ] **Step 2: Wrap `next.config.ts` with Serwist + expose a deterministic build revision**

Replace the file with:
```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withSerwist } from "@serwist/turbopack";

// Stable across replicas, busts per deploy, needs no runtime git: CI sets SOURCE_COMMIT
// (the pinned image SHA); locally we fall back to a per-build timestamp. next.config runs
// once per build in Node, so Date.now() here is a build stamp, not a per-request value.
const BUILD_REV = process.env.SOURCE_COMMIT || process.env.GIT_SHA || String(Date.now());

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "*": ["./_archive/**"] },
  env: { NEXT_PUBLIC_BUILD_SHA: BUILD_REV },
};

export default withSerwist(
  withSentryConfig(nextConfig, {
    silent: !process.env.CI,
    sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  }),
);
```

- [ ] **Step 3: Create the SW route handler `src/app/serwist/[path]/route.ts`**

```ts
import { createSerwistRoute } from "@serwist/turbopack";

// Precache revision comes from the build (no runtime `git`). See next.config.ts.
const revision = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
```

- [ ] **Step 4: Create the minimal service worker `src/app/sw.ts`**

```ts
/// <reference lib="webworker" />
import { Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Runtime caching is added in Tasks 3 (audio) and 4 (static). We intentionally do NOT
  // import Serwist's `defaultCache` — navigations/RSC/API stay network-only so no
  // authenticated content is ever persisted. Offline document requests hit the fallback.
  runtimeCaching: [],
  fallbacks: {
    entries: [
      { url: "/~offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();
```

- [ ] **Step 5: Create the offline page `src/app/~offline/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Mascot } from "@/components/art/Mascot";

export const metadata: Metadata = { title: "Offline" };

// Static, no-auth, no DB. Precached and served as the offline document fallback.
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-center">
      <div className="max-w-sm">
        <Mascot mood="think" size={140} className="mx-auto" />
        <h1 className="mt-6 font-display text-2xl font-semibold text-ink">You&rsquo;re offline</h1>
        <p className="mt-3 text-ink-soft">
          Kaelyn&rsquo;s Academy needs the internet for lessons. Reconnect and we&rsquo;ll pick up
          right where you left off.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create the web manifest `src/app/manifest.ts`**

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

- [ ] **Step 7: Write the manifest test `src/app/manifest.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("is installable: standalone, root start_url, paper theme", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.theme_color).toBe("#fdf6e9");
    expect(m.background_color).toBe("#fdf6e9");
    expect(m.name).toBe("Kaelyn's Academy");
  });

  it("ships 192 + 512 + a maskable icon", () => {
    const icons = manifest().icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(icons.every((i) => i.type === "image/png")).toBe(true);
  });
});
```

- [ ] **Step 8: Run the manifest test**

Run: `bun run test -- manifest`
Expected: PASS (2 tests).

- [ ] **Step 9: Register the SW + add Apple metadata in `src/app/layout.tsx`**

Add imports near the top:
```tsx
import { SerwistProvider } from "@serwist/turbopack/react";
```

Extend `metadata` with `appleWebApp` (keep existing fields):
```tsx
export const metadata: Metadata = {
  title: {
    default: "Kaelyn's Academy",
    template: "%s · Kaelyn's Academy",
  },
  description:
    "A warm, adaptive learning studio for young children. Every subject meets each child at her real level and teaches forward, one mastered skill at a time, with gentle AI tutoring.",
  applicationName: "Kaelyn's Academy",
  appleWebApp: { capable: true, title: "Kaelyn's Academy", statusBarStyle: "default" },
};
```

Wrap the body children:
```tsx
  return (
    <html lang="en" className={`${fraunces.variable} ${lexend.variable}`}>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">{children}</SerwistProvider>
      </body>
    </html>
  );
```

- [ ] **Step 10: Typecheck + lint the new worker/route files**

Run: `bun run typecheck && bun run lint`
Expected: PASS with no errors and **no rule-disabling**.
If `sw.ts` raises DOM-vs-WebWorker lib conflicts despite `skipLibCheck`, the fix is a dedicated `tsconfig.sw.json` (`"lib": ["webworker","esnext"]`, `"include": ["src/app/sw.ts"]`) added to the `typecheck` script — NOT a `@ts-ignore`.

- [ ] **Step 11: Production build (standalone) — the spike**

Run: `bun run build`
Expected: build succeeds; output includes the `/serwist/[path]` route and a `~offline` route. No error about missing `git`/`esbuild`.

- [ ] **Step 12: Serve the standalone build and verify installability + offline**

Run: `bun run start` (then drive Chrome via the chrome-devtools skill against `http://localhost:3000`).
Verify ALL of:
1. `GET /serwist/sw.js` returns JS (200) and DevTools ▸ Application ▸ Service Workers shows it **activated with scope `/`**.
2. Application ▸ Manifest shows name/icons; Lighthouse (or the install affordance) reports the app **installable**.
3. DevTools ▸ Network ▸ Offline, reload a route → the branded `/~offline` page renders (not the browser error).

**If the standalone build/serve cannot emit or register the SW** (e.g., the route needs runtime `git`/`esbuild` that tracing dropped): switch to a build-time static emit — pass `swDest` so the SW is written to `public/sw.js`, set `swUrl="/sw.js"`, and re-verify. Same `sw.ts`, different delivery. Record the chosen path in the commit message.

- [ ] **Step 13: Commit**

```bash
git add next.config.ts "src/app/serwist" "src/app/sw.ts" "src/app/~offline" src/app/manifest.ts src/app/manifest.test.ts src/app/layout.tsx package.json bun.lock
git commit -m "feat(pwa): Serwist/Turbopack service worker, web manifest, and offline fallback"
```

---

## Task 3: Audio runtime caching (replay offline)

**Files:**
- Create: `src/lib/pwa/cacheRules.ts`
- Create: `src/lib/pwa/cacheRules.test.ts`
- Modify: `src/app/sw.ts` (add the audio rule)

**Interfaces:**
- Produces: `isAudioRequest(url: URL, sameOrigin: boolean): boolean` — true for same-origin pre-generated clip GETs under `/audio/`. Consumed by `src/app/sw.ts` (via relative import `../lib/pwa/cacheRules`) and Task 4 extends the same file.

- [ ] **Step 1: Write the failing test `src/lib/pwa/cacheRules.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { isAudioRequest } from "./cacheRules";

const u = (s: string) => new URL(s);

describe("isAudioRequest", () => {
  it("matches same-origin /audio clips", () => {
    expect(isAudioRequest(u("https://app/audio/en-US/k.m4a"), true)).toBe(true);
    expect(isAudioRequest(u("https://app/audio/en/cache/abc.mp3"), true)).toBe(true);
  });
  it("rejects non-audio, the TTS POST route, and cross-origin", () => {
    expect(isAudioRequest(u("https://app/api/tts"), true)).toBe(false);
    expect(isAudioRequest(u("https://app/learn"), true)).toBe(false);
    expect(isAudioRequest(u("https://cdn/audio/en/x.m4a"), false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun run test -- cacheRules`
Expected: FAIL ("isAudioRequest is not a function" / module not found).

- [ ] **Step 3: Implement `src/lib/pwa/cacheRules.ts`**

```ts
// Pure predicates for service-worker runtime caching. Kept out of sw.ts so they are
// unit-testable without a worker/DOM environment. Imported by sw.ts via a RELATIVE
// path (esbuild bundles the worker and may not resolve the "@/" tsconfig alias).

/** Same-origin pre-generated audio clip GET (`/audio/<locale>/<key>.<ext>`). */
export function isAudioRequest(url: URL, sameOrigin: boolean): boolean {
  return sameOrigin && url.pathname.startsWith("/audio/");
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun run test -- cacheRules`
Expected: PASS.

- [ ] **Step 5: Wire the audio rule into `src/app/sw.ts`**

REPLACE the existing `import { Serwist } from "serwist";` line with the expanded import below, and add the `cacheRules` import beneath it (do not leave a second `serwist` import line):
```ts
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  RangeRequestsPlugin,
  Serwist,
} from "serwist";
import { isAudioRequest } from "../lib/pwa/cacheRules";
```

Replace `runtimeCaching: [],` with:
```ts
  runtimeCaching: [
    // Clips are immutable per key → CacheFirst. RangeRequestsPlugin serves byte ranges
    // from the cached full response (the <audio> element issues Range requests).
    {
      matcher: ({ url, sameOrigin }) => isAudioRequest(url, sameOrigin),
      handler: new CacheFirst({
        cacheName: "audio-clips",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new RangeRequestsPlugin(),
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: PASS.

- [ ] **Step 7: Verify offline audio replay**

Run: `bun run start`; in Chrome, sign in and play a narrated activity so a clip loads (Network shows `GET /audio/...` 200). Then DevTools ▸ Network ▸ Offline and replay the same clip.
Expected: the clip plays from cache (Application ▸ Cache Storage ▸ `audio-clips` contains it).
If the clip is NOT cached because the first request was a `Range` (206), add a `requestWillFetch` plugin to the audio handler that strips the `Range` header so the origin returns a full 200 (RangeRequestsPlugin then slices it). Re-verify.

- [ ] **Step 8: Commit**

```bash
git add src/lib/pwa/cacheRules.ts src/lib/pwa/cacheRules.test.ts "src/app/sw.ts"
git commit -m "feat(pwa): cache audio clips (CacheFirst + Range) for offline replay"
```

---

## Task 4: Static-asset runtime caching

**Files:**
- Modify: `src/lib/pwa/cacheRules.ts` (add `isImmutableStaticAsset`)
- Modify: `src/lib/pwa/cacheRules.test.ts`
- Modify: `src/app/sw.ts` (add the static rule)

**Interfaces:**
- Produces: `isImmutableStaticAsset(url: URL, sameOrigin: boolean): boolean` — true for `/_next/static/*` (content-hashed JS/CSS + self-hosted `next/font` media). Consumed by `src/app/sw.ts`.

- [ ] **Step 1: Add the failing test (append to `src/lib/pwa/cacheRules.test.ts`)**

```ts
import { isImmutableStaticAsset } from "./cacheRules";

describe("isImmutableStaticAsset", () => {
  it("matches same-origin /_next/static (hashed JS/CSS/fonts)", () => {
    expect(isImmutableStaticAsset(u("https://app/_next/static/chunks/x.js"), true)).toBe(true);
    expect(isImmutableStaticAsset(u("https://app/_next/static/media/font.woff2"), true)).toBe(true);
  });
  it("rejects HTML, RSC, and cross-origin", () => {
    expect(isImmutableStaticAsset(u("https://app/learn"), true)).toBe(false);
    expect(isImmutableStaticAsset(u("https://app/_next/static/x.js"), false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun run test -- cacheRules`
Expected: FAIL ("isImmutableStaticAsset is not a function").

- [ ] **Step 3: Implement (append to `src/lib/pwa/cacheRules.ts`)**

```ts
/** Next's content-hashed build assets (JS/CSS + self-hosted next/font media). Immutable. */
export function isImmutableStaticAsset(url: URL, sameOrigin: boolean): boolean {
  return sameOrigin && url.pathname.startsWith("/_next/static/");
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun run test -- cacheRules`
Expected: PASS (all 4 cacheRules tests).

- [ ] **Step 5: Wire the static rule into `src/app/sw.ts`**

Update the import to include the new predicate:
```ts
import { isAudioRequest, isImmutableStaticAsset } from "../lib/pwa/cacheRules";
```

Add this entry to the `runtimeCaching` array (after the audio rule):
```ts
    // Content-hashed → safe to cache long-term; old entries fall out of the manifest on deploy.
    {
      matcher: ({ url, sameOrigin }) => isImmutableStaticAsset(url, sameOrigin),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 90 * 24 * 60 * 60 }),
        ],
      }),
    },
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pwa/cacheRules.ts src/lib/pwa/cacheRules.test.ts "src/app/sw.ts"
git commit -m "feat(pwa): runtime-cache /_next/static assets (CacheFirst)"
```

---

## Task 5: iOS "Add to Home Screen" hint

**Files:**
- Create: `src/lib/pwa/iosHint.ts`
- Create: `src/lib/pwa/iosHint.test.ts`
- Create: `src/components/pwa/IosInstallHint.tsx`
- Modify: `src/app/layout.tsx` (mount the hint)

**Interfaces:**
- Produces: `shouldShowIosHint(env: IosHintEnv): boolean` where `IosHintEnv = { userAgent: string; maxTouchPoints: number; isStandalone: boolean; dismissed: boolean }`. Consumed by `IosInstallHint.tsx`.

- [ ] **Step 1: Write the failing test `src/lib/pwa/iosHint.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { shouldShowIosHint } from "./iosHint";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const base = { isStandalone: false, dismissed: false, maxTouchPoints: 5 };

describe("shouldShowIosHint", () => {
  it("shows on iPhone Safari (not installed, not dismissed)", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IPHONE })).toBe(true);
  });
  it("shows on iPadOS reporting the desktop UA (touch points > 1)", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 })).toBe(true);
  });
  it("hides once installed (standalone) or dismissed", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IPHONE, isStandalone: true })).toBe(false);
    expect(shouldShowIosHint({ ...base, userAgent: IPHONE, dismissed: true })).toBe(false);
  });
  it("hides on iOS Chrome, Android, and desktop Safari (no touch)", () => {
    expect(shouldShowIosHint({ ...base, userAgent: IOS_CHROME })).toBe(false);
    expect(shouldShowIosHint({ ...base, userAgent: ANDROID })).toBe(false);
    expect(shouldShowIosHint({ ...base, userAgent: MAC_SAFARI, maxTouchPoints: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bun run test -- iosHint`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/pwa/iosHint.ts`**

```ts
export interface IosHintEnv {
  userAgent: string;
  maxTouchPoints: number;
  isStandalone: boolean;
  dismissed: boolean;
}

/** Show the A2HS hint only on iOS *Safari*, when not already installed or dismissed.
 *  iPadOS 13+ reports the macOS UA, so detect it via a touch-capable "Macintosh". */
export function shouldShowIosHint(env: IosHintEnv): boolean {
  if (env.isStandalone || env.dismissed) return false;
  const ua = env.userAgent;
  const iPhoneOrIpad = /iphone|ipad|ipod/i.test(ua);
  const iPadOnMac = /macintosh/i.test(ua) && env.maxTouchPoints > 1;
  if (!iPhoneOrIpad && !iPadOnMac) return false;
  // Exclude in-app WebKit wrappers that can't A2HS via Share (Chrome/Firefox/Edge on iOS).
  return /safari/i.test(ua) && !/(crios|fxios|edgios)/i.test(ua);
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bun run test -- iosHint`
Expected: PASS (4 tests).

- [ ] **Step 5: Build the client component `src/components/pwa/IosInstallHint.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ShareIcon, XIcon } from "@phosphor-icons/react";
import { shouldShowIosHint } from "@/lib/pwa/iosHint";

const DISMISS_KEY = "ka-ios-a2hs-dismissed";

export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setShow(
      shouldShowIosHint({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        isStandalone,
        dismissed: localStorage.getItem(DISMISS_KEY) === "1",
      }),
    );
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install Kaelyn's Academy"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-paper-raised px-4 py-3 shadow-lg"
    >
      <ShareIcon weight="bold" className="size-6 shrink-0 text-honey-deep" />
      <p className="text-sm text-ink-soft">
        Install Kaelyn&rsquo;s Academy: tap{" "}
        <span className="font-semibold text-ink">Share</span> then{" "}
        <span className="font-semibold text-ink">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
      >
        <XIcon weight="bold" className="size-5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Mount the hint in `src/app/layout.tsx`**

Add the import:
```tsx
import { IosInstallHint } from "@/components/pwa/IosInstallHint";
```

Render it inside the provider (alongside `children`):
```tsx
        <SerwistProvider swUrl="/serwist/sw.js">
          {children}
          <IosInstallHint />
        </SerwistProvider>
```

- [ ] **Step 7: Typecheck, lint, build**

Run: `bun run typecheck && bun run lint && bun run build`
Expected: PASS.

- [ ] **Step 8: Verify the hint behavior (Chrome device emulation)**

Run: `bun run start`; in Chrome DevTools device toolbar, emulate an iPhone (Safari UA) → the banner appears; click dismiss → it disappears and stays gone on reload (localStorage `ka-ios-a2hs-dismissed=1`). Emulate Android/desktop → no banner.

- [ ] **Step 9: Commit**

```bash
git add src/lib/pwa/iosHint.ts src/lib/pwa/iosHint.test.ts src/components/pwa/IosInstallHint.tsx src/app/layout.tsx
git commit -m "feat(pwa): dismissible iOS Add-to-Home-Screen hint"
```

---

## Task 6: Env, deploy docs, and final verification

**Files:**
- Modify: `.env.example`
- Modify: `DEPLOY.md`

- [ ] **Step 1: Document the build-revision env in `.env.example`**

Append:
```bash
# --- PWA ---
# Commit SHA baked into the service-worker precache revision (stable across replicas,
# busts on each deploy, needs no runtime git). CI sets this to the pinned image SHA;
# locally it falls back to a build-time stamp. Exposed to the app as NEXT_PUBLIC_BUILD_SHA.
SOURCE_COMMIT=
```

- [ ] **Step 2: Note the CI requirement in `DEPLOY.md`**

Add a short subsection (near the build step) stating: the CI build MUST pass `SOURCE_COMMIT` (the pinned commit/image SHA) as a build env so `next.config.ts` derives a deterministic service-worker precache revision. Without it, the SW still works but precache revisions fall back to a per-build timestamp.

- [ ] **Step 3: Run the full pre-merge gate**

Run: `bun run lint && bun run typecheck && bun run test && bun run build`
Expected: all green (the four `cacheRules`/`iosHint`/`manifest` suites included).

- [ ] **Step 4: Final PWA verification against the production build**

Run: `bun run start`; with the chrome-devtools skill, confirm the full acceptance checklist:
1. Lighthouse PWA / "installable" passes; Application ▸ Manifest shows the Twinkle icons.
2. Service worker active, scope `/`.
3. Offline → navigation shows `/~offline` (not the dino page).
4. Play a clip online → go offline → it replays from `audio-clips` cache.
5. Application ▸ Cache Storage shows `audio-clips` + `next-static`, and **no cache holding authenticated HTML/RSC** (privacy invariant).
6. iOS emulation shows the A2HS hint; dismissal persists.

- [ ] **Step 5: Commit**

```bash
git add .env.example DEPLOY.md
git commit -m "docs(pwa): document SOURCE_COMMIT build env for SW precache revision"
```

---

## Definition of Done

- App installs on Android/desktop (native) and iOS (A2HS hint), launches standalone with a `#fdf6e9` splash and the Twinkle icon.
- Offline: branded `/~offline` screen; already-played `/audio` clips replay; `/_next/static` cached.
- No authenticated HTML/RSC/API is ever cached (verified in Cache Storage).
- `bun run lint && bun run typecheck && bun run test && bun run build` all green; no rule-disabling anywhere.
- After all tasks: use **superpowers:finishing-a-development-branch** to open the PR / integrate.

## Self-review notes (spec coverage)

- Manifest → Task 2 (+ test). Icons (Twinkle, 192/512/maskable/apple/favicon) → Task 1.
- SW + caching: audio CacheFirst+Range → Task 3; `/_next/static` → Task 4; navigations/RSC/API network-only (no `defaultCache`) → Task 2. `/~offline` → Task 2.
- Install UX native + iOS hint → Task 5. Deploy revision / no-runtime-git / standalone spike → Task 2 (+ env docs Task 6).
- **Refinement vs spec §Architecture:** the spec described keeping static entries by *filtering* `defaultCache`; this plan instead uses **explicit `/audio` + `/_next/static` rules and never imports `defaultCache`** — more robust (no dependency on Serwist's internal `cacheName`s) and the same guarantee (no pages/RSC/API cached). No `next/image` is used, so no image rule is needed.
