# English Kokoro TTS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voice all English site narration with the homelab Kokoro `af_heart` neural voice instead of the browser Web Speech voice, content-addressed and durably cached, leaving foreign-language audio untouched.

**Architecture:** A `POST /api/tts` route hashes the text (`ttsKey`), returns `303` to a cached clip at `/audio/en/<key>.mp3` on hit, or synthesizes via Kokoro and streams the mp3 on miss (write-through to MinIO when storage creds are configured). Static content is durably cached (`en/`), one-off dynamic content goes to an auto-expiring tier (`en/cache/`). Two stable seams — `speak()` and the English branch of `useSpeech()` — delegate to a client `narrate()` helper that plays the route's audio and falls back to Web Speech on any failure.

**Tech Stack:** Next.js 16 (App Router route handlers, RSC), TypeScript strict, `minio` client (write-through), Kokoro fastapi (OpenAI-compatible `/audio/speech`), MinIO, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-06-15-english-kokoro-tts-design.md`

**Conventions (read before starting):**
- Package manager is **bun** (never npm/yarn). Run a single test file: `bun run test src/path/file.test.ts`. Full suite: `bun run test`.
- **Never** call `getEnv`/network at module top-level — lazy, per-request only (breaks `next build`).
- **Never** disable a lint rule or use `@ts-ignore` — fix the root cause.
- Errors that must not break the child are reported via `captureNonCritical(message, error)` from `@/lib/capture`.
- Commit after each task. Gate before merge: `bun run lint && bun run typecheck && bun run test && bun run build`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/audio/config.ts` (new) | Voice/speed config + tier prefixes + clip path/URL helpers. No I/O. |
| `src/lib/audio/ttsKey.ts` (new) | Text normalization + sha256 content key. |
| `src/lib/audio/kokoro.ts` (new) | `synthesizeMp3()` — call Kokoro, return mp3 bytes. |
| `src/lib/audio/store.ts` (new) | `clipExists()` (anon HEAD) + `putClip()` (minio write-through). |
| `src/lib/audio/narration.ts` (new) | `ensureNarration()` — key→exists→synth→store; for pre-synth + warm pass. |
| `src/app/api/tts/route.ts` (new) | POST handler: hit→303 / miss→synth+stream / down→503 + in-flight dedupe. |
| `src/components/learner/narrate.ts` (new) | Client: play `/api/tts` audio; fall back to Web Speech; cancel handle. |
| `src/components/learner/speak.ts` (modify) | Delegate `speak()` to `narrate()` (English); keep public API + synth fallback. |
| `src/activities/_shared/useSpeech.ts` (modify) | English branch routes through `narrate()`; non-English unchanged. |
| `src/lib/ai/practice.ts` (modify) | Pre-synthesize spoken English fields after generation (best-effort). |
| `scripts/warm-english-audio.ts` (new) | Seed durable clips for all static English strings. |
| `.env.example` (modify) | Document new env vars. |
| `package.json` (modify) | Add `minio` dependency. |

---

## Task 1: Audio config + tier helpers

**Files:**
- Create: `src/lib/audio/config.ts`
- Test: `src/lib/audio/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audio/config.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DURABLE_PREFIX,
  EPHEMERAL_PREFIX,
  clipObjectPath,
  clipPublicUrl,
  enSpeed,
  enVoice,
  prefixFor,
} from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("audio config", () => {
  it("maps persist tiers to prefixes", () => {
    expect(prefixFor("durable")).toBe(DURABLE_PREFIX);
    expect(prefixFor("ephemeral")).toBe(EPHEMERAL_PREFIX);
    expect(prefixFor(undefined)).toBe(DURABLE_PREFIX); // default durable
  });

  it("builds object paths and public urls from a key", () => {
    expect(clipObjectPath("en", "abc")).toBe("en/abc.mp3");
    expect(clipObjectPath("en/cache", "abc")).toBe("en/cache/abc.mp3");
    expect(clipPublicUrl("en", "abc")).toBe("/audio/en/abc.mp3");
  });

  it("honors NEXT_PUBLIC_AUDIO_BASE_URL for public urls", () => {
    vi.stubEnv("NEXT_PUBLIC_AUDIO_BASE_URL", "https://cdn.example.com/clips/");
    expect(clipPublicUrl("en", "abc")).toBe("https://cdn.example.com/clips/en/abc.mp3");
  });

  it("defaults voice/speed but honors env overrides", () => {
    expect(enVoice()).toBe("af_heart");
    expect(enSpeed()).toBe(0.9);
    vi.stubEnv("KOKORO_EN_VOICE", "af_bella");
    vi.stubEnv("KOKORO_EN_SPEED", "1.05");
    expect(enVoice()).toBe("af_bella");
    expect(enSpeed()).toBe(1.05);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/lib/audio/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Implement**

```ts
// src/lib/audio/config.ts
/**
 * Static config + addressing for English neural narration clips. No I/O here —
 * env is read per call (never at module load) so this is safe to import anywhere.
 */
import { getEnv } from "@/lib/env";

export type Persist = "durable" | "ephemeral";

/** Permanent tier: static UI + pre-synth-on-generation. */
export const DURABLE_PREFIX = "en";
/** Auto-expiring tier (MinIO lifecycle): one-off dynamic speech. */
export const EPHEMERAL_PREFIX = "en/cache";

export function prefixFor(persist: Persist | undefined): string {
  return persist === "ephemeral" ? EPHEMERAL_PREFIX : DURABLE_PREFIX;
}

/** Object key within the bucket, e.g. `en/<key>.mp3`. */
export function clipObjectPath(prefix: string, key: string): string {
  return `${prefix}/${key}.mp3`;
}

function audioBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_AUDIO_BASE_URL : undefined;
  return fromEnv && fromEnv.trim() ? fromEnv.trim().replace(/\/$/, "") : "/audio";
}

/** Same-origin (or CDN) URL the browser plays, served by the `/audio` proxy. */
export function clipPublicUrl(prefix: string, key: string): string {
  return `${audioBaseUrl()}/${clipObjectPath(prefix, key)}`;
}

/** Kokoro English voice (default warm US female). */
export function enVoice(): string {
  return getEnv("KOKORO_EN_VOICE", "af_heart");
}

/** Kokoro speaking rate — a touch slow for young ears. */
export function enSpeed(): number {
  const raw = getEnv("KOKORO_EN_SPEED", "0.9");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0.9;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/lib/audio/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio/config.ts src/lib/audio/config.test.ts
git commit -m "feat(audio): English narration config + tier addressing"
```

---

## Task 2: Content key (`ttsKey`)

**Files:**
- Create: `src/lib/audio/ttsKey.ts`
- Test: `src/lib/audio/ttsKey.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audio/ttsKey.test.ts
import { describe, expect, it } from "vitest";
import { normalizeText, ttsKey } from "./ttsKey";

describe("ttsKey", () => {
  it("normalizes surrounding + internal whitespace only", () => {
    expect(normalizeText("  Find   the\nword ")).toBe("Find the word");
    expect(normalizeText("Keep Case!")).toBe("Keep Case!"); // case + punctuation preserved
  });

  it("is deterministic and 64-char hex", () => {
    const k = ttsKey("Find the word", "af_heart", 0.9);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(ttsKey("Find the word", "af_heart", 0.9)).toBe(k);
  });

  it("dedupes trivial whitespace differences", () => {
    expect(ttsKey("Find  the word", "af_heart", 0.9)).toBe(
      ttsKey(" Find the word ", "af_heart", 0.9),
    );
  });

  it("changes with voice and speed", () => {
    const base = ttsKey("hi", "af_heart", 0.9);
    expect(ttsKey("hi", "af_bella", 0.9)).not.toBe(base);
    expect(ttsKey("hi", "af_heart", 1.0)).not.toBe(base);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/lib/audio/ttsKey.test.ts`
Expected: FAIL — cannot find module `./ttsKey`.

- [ ] **Step 3: Implement**

```ts
// src/lib/audio/ttsKey.ts
/** Content-addressed key for a narration clip. Server-only (node crypto). */
import { createHash } from "node:crypto";

/** Trim + collapse internal whitespace so spacing differences dedupe. Case and
 *  punctuation are preserved because they change prosody. */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** sha256 of `<normalized>|<voice>|<speed>` as lowercase hex. */
export function ttsKey(text: string, voice: string, speed: number): string {
  const payload = `${normalizeText(text)}|${voice}|${speed}`;
  return createHash("sha256").update(payload).digest("hex");
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/lib/audio/ttsKey.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio/ttsKey.ts src/lib/audio/ttsKey.test.ts
git commit -m "feat(audio): content-addressed ttsKey"
```

---

## Task 3: Kokoro synth client

**Files:**
- Create: `src/lib/audio/kokoro.ts`
- Test: `src/lib/audio/kokoro.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audio/kokoro.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeMp3 } from "./kokoro";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("synthesizeMp3", () => {
  it("POSTs Kokoro /audio/speech as mp3 and returns the bytes", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(async () =>
      new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await synthesizeMp3("hello", "af_heart", 0.9);

    expect(out).toEqual(bytes);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://kokoro.test/v1/audio/speech");
    expect(JSON.parse(init.body)).toEqual({
      model: "kokoro",
      input: "hello",
      voice: "af_heart",
      response_format: "mp3",
      speed: 0.9,
    });
  });

  it("throws on a non-OK Kokoro response", async () => {
    vi.stubEnv("KOKORO_URL", "http://kokoro.test/v1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    await expect(synthesizeMp3("hi", "af_heart", 0.9)).rejects.toThrow(/kokoro 503/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/lib/audio/kokoro.test.ts`
Expected: FAIL — cannot find module `./kokoro`.

- [ ] **Step 3: Implement**

```ts
// src/lib/audio/kokoro.ts
/** Thin client for the homelab kokoro-fastapi OpenAI-compatible TTS endpoint. */
import { getEnv } from "@/lib/env";

const SYNTH_TIMEOUT_MS = 30_000;

/** Synthesize `text` to mp3 bytes. Throws on unreachable/timeout/non-OK. */
export async function synthesizeMp3(
  text: string,
  voice: string,
  speed: number,
): Promise<Uint8Array> {
  const base = getEnv("KOKORO_URL", "http://localhost:8880/v1").replace(/\/$/, "");
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "kokoro",
      input: text,
      voice,
      response_format: "mp3",
      speed,
    }),
    signal: AbortSignal.timeout(SYNTH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`kokoro ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/lib/audio/kokoro.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio/kokoro.ts src/lib/audio/kokoro.test.ts
git commit -m "feat(audio): Kokoro mp3 synth client"
```

---

## Task 4: Object store (`clipExists` + `putClip`)

**Files:**
- Modify: `package.json` (add `minio`)
- Create: `src/lib/audio/store.ts`
- Test: `src/lib/audio/store.test.ts`

- [ ] **Step 1: Add the minio dependency**

Check the latest stable version first (per repo policy):
Run: `curl -s https://registry.npmjs.org/minio/latest | grep -o '"version":"[^"]*"' | head -1`
Then: `bun add minio` (installs latest).

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/audio/store.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

const putObject = vi.fn();
vi.mock("minio", () => ({
  Client: vi.fn(() => ({ putObject })),
}));

import { clipExists, putClip } from "./store";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  putObject.mockReset();
});

describe("clipExists", () => {
  it("HEADs the public AUDIO_ORIGIN path and maps ok→true", async () => {
    vi.stubEnv("AUDIO_ORIGIN", "http://minio.test/bucket/");
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(clipExists("en", "abc")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://minio.test/bucket/en/abc.mp3");
    expect(init.method).toBe("HEAD");
  });

  it("is false on 404 and false when AUDIO_ORIGIN is unset", async () => {
    vi.stubEnv("AUDIO_ORIGIN", "http://minio.test/bucket");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(clipExists("en", "missing")).resolves.toBe(false);

    vi.stubEnv("AUDIO_ORIGIN", "");
    await expect(clipExists("en", "abc")).resolves.toBe(false);
  });
});

describe("putClip", () => {
  it("returns false (skips) when write creds are not configured", async () => {
    vi.stubEnv("AUDIO_S3_ENDPOINT", "");
    await expect(putClip("en", "abc", new Uint8Array([1]))).resolves.toBe(false);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("writes via minio and returns true when configured", async () => {
    vi.stubEnv("AUDIO_S3_ENDPOINT", "minio.test");
    vi.stubEnv("AUDIO_S3_ACCESS_KEY", "k");
    vi.stubEnv("AUDIO_S3_SECRET_KEY", "s");
    vi.stubEnv("AUDIO_S3_BUCKET", "kaelyns-academy-audio");
    putObject.mockResolvedValue({ etag: "x" });

    await expect(putClip("en", "abc", new Uint8Array([1, 2]))).resolves.toBe(true);
    const [bucket, objectName, , , meta] = putObject.mock.calls[0];
    expect(bucket).toBe("kaelyns-academy-audio");
    expect(objectName).toBe("en/abc.mp3");
    expect(meta["Content-Type"]).toBe("audio/mpeg");
  });

  it("returns false (never throws) when the write fails", async () => {
    vi.stubEnv("AUDIO_S3_ENDPOINT", "minio.test");
    vi.stubEnv("AUDIO_S3_ACCESS_KEY", "k");
    vi.stubEnv("AUDIO_S3_SECRET_KEY", "s");
    vi.stubEnv("AUDIO_S3_BUCKET", "b");
    putObject.mockRejectedValue(new Error("down"));
    await expect(putClip("en", "abc", new Uint8Array([1]))).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `bun run test src/lib/audio/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 4: Implement**

```ts
// src/lib/audio/store.ts
/**
 * Object-store access for narration clips. Reads are creds-free (anonymous HEAD
 * against AUDIO_ORIGIN, same bucket the `/audio` proxy serves). Writes use a
 * scoped MinIO credential; when unconfigured, writes are skipped (returns false)
 * so dev/test still synthesize-and-stream without durable caching.
 */
import { Buffer } from "node:buffer";
import { getEnv } from "@/lib/env";
import { captureNonCritical } from "@/lib/capture";
import { clipObjectPath } from "./config";

/** True if a clip already exists in the bucket (anonymous HEAD via AUDIO_ORIGIN). */
export async function clipExists(prefix: string, key: string): Promise<boolean> {
  const origin = getEnv("AUDIO_ORIGIN", "").trim().replace(/\/$/, "");
  if (!origin) return false;
  try {
    const res = await fetch(`${origin}/${clipObjectPath(prefix, key)}`, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface S3Config {
  endPoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  port?: number;
  useSSL: boolean;
}

function s3Config(): S3Config | null {
  const endpointRaw = getEnv("AUDIO_S3_ENDPOINT", "").trim();
  const accessKey = getEnv("AUDIO_S3_ACCESS_KEY", "").trim();
  const secretKey = getEnv("AUDIO_S3_SECRET_KEY", "").trim();
  const bucket = getEnv("AUDIO_S3_BUCKET", "").trim();
  if (!endpointRaw || !accessKey || !secretKey || !bucket) return null;
  // Accept "host", "host:port", or "http(s)://host:port".
  const useSSL = endpointRaw.startsWith("https://");
  const hostPort = endpointRaw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [endPoint, portStr] = hostPort.split(":");
  const port = portStr ? Number.parseInt(portStr, 10) : undefined;
  return { endPoint, accessKey, secretKey, bucket, port, useSSL };
}

/** Write-through a clip. Returns false (and never throws) when unconfigured or on error. */
export async function putClip(prefix: string, key: string, bytes: Uint8Array): Promise<boolean> {
  const cfg = s3Config();
  if (!cfg) return false;
  try {
    const { Client } = await import("minio");
    const client = new Client({
      endPoint: cfg.endPoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });
    const body = Buffer.from(bytes);
    await client.putObject(cfg.bucket, clipObjectPath(prefix, key), body, body.length, {
      "Content-Type": "audio/mpeg",
    });
    return true;
  } catch (err) {
    captureNonCritical(`putClip failed for ${prefix}/${key}`, err);
    return false;
  }
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `bun run test src/lib/audio/store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/lib/audio/store.ts src/lib/audio/store.test.ts
git commit -m "feat(audio): MinIO clip store (anon read, scoped write-through)"
```

---

## Task 5: `ensureNarration` (pre-synth + warm)

**Files:**
- Create: `src/lib/audio/narration.ts`
- Test: `src/lib/audio/narration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/audio/narration.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./kokoro", () => ({ synthesizeMp3: vi.fn() }));
vi.mock("./store", () => ({ clipExists: vi.fn(), putClip: vi.fn() }));

import { synthesizeMp3 } from "./kokoro";
import { clipExists, putClip } from "./store";
import { ensureNarration } from "./narration";

afterEach(() => vi.resetAllMocks());

describe("ensureNarration", () => {
  it("no-ops when the durable clip already exists", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const r = await ensureNarration("Find the word");
    expect(r.stored).toBe(true);
    expect(r.prefix).toBe("en");
    expect(synthesizeMp3).not.toHaveBeenCalled();
    expect(putClip).not.toHaveBeenCalled();
  });

  it("synthesizes and write-throughs on a miss", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([1]));
    vi.mocked(putClip).mockResolvedValue(true);
    const r = await ensureNarration("Find the word");
    expect(synthesizeMp3).toHaveBeenCalledWith("Find the word", "af_heart", 0.9);
    expect(putClip).toHaveBeenCalledWith("en", r.key, expect.any(Uint8Array));
    expect(r.stored).toBe(true);
  });

  it("uses the ephemeral prefix when persist=ephemeral", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([1]));
    vi.mocked(putClip).mockResolvedValue(true);
    const r = await ensureNarration("one off", { persist: "ephemeral" });
    expect(r.prefix).toBe("en/cache");
    expect(putClip).toHaveBeenCalledWith("en/cache", r.key, expect.any(Uint8Array));
  });

  it("swallows synth failure and reports stored=false", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockRejectedValue(new Error("kokoro down"));
    const r = await ensureNarration("Find the word");
    expect(r.stored).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/lib/audio/narration.test.ts`
Expected: FAIL — cannot find module `./narration`.

- [ ] **Step 3: Implement**

```ts
// src/lib/audio/narration.ts
/**
 * Server-side "make sure a durable clip exists" helper, used by pre-synth-on-
 * generation and the warm-pass script. Best-effort and idempotent: it never
 * throws (callers fire-and-forget), so a failure just costs a later on-demand
 * synth via /api/tts.
 */
import { captureNonCritical } from "@/lib/capture";
import { type Persist, enSpeed, enVoice, prefixFor } from "./config";
import { synthesizeMp3 } from "./kokoro";
import { ttsKey } from "./ttsKey";
import { clipExists, putClip } from "./store";

export interface EnsureNarrationOptions {
  voice?: string;
  speed?: number;
  persist?: Persist;
}

export interface EnsureNarrationResult {
  key: string;
  prefix: string;
  /** True if the clip is durably present after this call (already existed or written). */
  stored: boolean;
}

export async function ensureNarration(
  text: string,
  options: EnsureNarrationOptions = {},
): Promise<EnsureNarrationResult> {
  const voice = options.voice ?? enVoice();
  const speed = options.speed ?? enSpeed();
  const prefix = prefixFor(options.persist);
  const key = ttsKey(text, voice, speed);

  try {
    if (await clipExists(prefix, key)) return { key, prefix, stored: true };
    const bytes = await synthesizeMp3(text, voice, speed);
    const stored = await putClip(prefix, key, bytes);
    return { key, prefix, stored };
  } catch (err) {
    captureNonCritical(`ensureNarration failed for ${prefix}/${key}`, err);
    return { key, prefix, stored: false };
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/lib/audio/narration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/audio/narration.ts src/lib/audio/narration.test.ts
git commit -m "feat(audio): ensureNarration (pre-synth + warm helper)"
```

---

## Task 6: `POST /api/tts` route

**Files:**
- Create: `src/app/api/tts/route.ts`
- Test: `src/app/api/tts/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/tts/route.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/kokoro", () => ({ synthesizeMp3: vi.fn() }));
vi.mock("@/lib/audio/store", () => ({ clipExists: vi.fn(), putClip: vi.fn() }));

import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { clipExists, putClip } from "@/lib/audio/store";
import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://test/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.resetAllMocks());

describe("POST /api/tts", () => {
  it("redirects (303) to the cached clip on a hit", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const res = await POST(post({ text: "Find the word" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^\/audio\/en\/[0-9a-f]{64}\.mp3$/);
    expect(synthesizeMp3).not.toHaveBeenCalled();
  });

  it("synthesizes, write-throughs, and streams mp3 on a miss", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(putClip).mockResolvedValue(true);
    const res = await POST(post({ text: "brand new passage" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(putClip).toHaveBeenCalled();
  });

  it("uses the ephemeral prefix when asked", async () => {
    vi.mocked(clipExists).mockResolvedValue(true);
    const res = await POST(post({ text: "one off", persist: "ephemeral" }));
    expect(res.headers.get("location")).toMatch(/^\/audio\/en\/cache\/[0-9a-f]{64}\.mp3$/);
  });

  it("returns 503 when Kokoro is down (client falls back to Web Speech)", async () => {
    vi.mocked(clipExists).mockResolvedValue(false);
    vi.mocked(synthesizeMp3).mockRejectedValue(new Error("kokoro 503"));
    const res = await POST(post({ text: "x" }));
    expect(res.status).toBe(503);
  });

  it("rejects an empty/invalid body with 400", async () => {
    const res = await POST(post({ text: "   " }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/app/api/tts/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Implement**

```ts
// src/app/api/tts/route.ts
/**
 * On-demand English narration. Hash the text; if a clip is already cached, 303 to
 * the immutable `/audio` URL (browser-cacheable). On a miss, synthesize via Kokoro,
 * write-through to MinIO (best-effort), and stream the mp3 back so first play works
 * even without durable storage. Kokoro unreachable → 503 so the client falls back
 * to browser TTS. Build-safe: all env/network is per-request.
 */
import { type Persist, clipObjectPath, clipPublicUrl, enSpeed, enVoice, prefixFor } from "@/lib/audio/config";
import { synthesizeMp3 } from "@/lib/audio/kokoro";
import { ttsKey } from "@/lib/audio/ttsKey";
import { clipExists, putClip } from "@/lib/audio/store";
import { captureNonCritical } from "@/lib/capture";

export const dynamic = "force-dynamic";

/** Dedupe concurrent identical synths within a process so a burst → one Kokoro call. */
const inflight = new Map<string, Promise<Uint8Array>>();

interface Body {
  text?: unknown;
  voice?: unknown;
  persist?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(null, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return new Response(null, { status: 400 });

  const voice = typeof body.voice === "string" && body.voice ? body.voice : enVoice();
  const speed = enSpeed();
  const persist: Persist = body.persist === "ephemeral" ? "ephemeral" : "durable";
  const prefix = prefixFor(persist);
  const key = ttsKey(text, voice, speed);

  // Hit (check the target tier; ephemeral also accepts a durable copy).
  if (await clipExists(prefix, key)) return redirect(prefix, key);
  if (persist === "ephemeral" && (await clipExists("en", key))) return redirect("en", key);

  // Miss: synthesize (deduped), write-through, stream.
  try {
    let promise = inflight.get(key);
    if (!promise) {
      promise = synthesizeMp3(text, voice, speed);
      inflight.set(key, promise);
    }
    let bytes: Uint8Array;
    try {
      bytes = await promise;
    } finally {
      inflight.delete(key);
    }
    void putClip(prefix, key, bytes); // best-effort; do not block playback
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "public, max-age=86400",
      },
    });
  } catch (err) {
    captureNonCritical(`/api/tts synth failed for ${clipObjectPath(prefix, key)}`, err);
    return new Response(null, { status: 503 });
  }
}

function redirect(prefix: string, key: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: clipPublicUrl(prefix, key) },
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/app/api/tts/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tts/route.ts src/app/api/tts/route.test.ts
git commit -m "feat(audio): POST /api/tts route (cache hit→303, miss→synth+stream)"
```

---

## Task 7: Client `narrate()`

**Files:**
- Create: `src/components/learner/narrate.ts`
- Test: `src/components/learner/narrate.test.ts`

Notes: `narrate` runs in the browser. It plays via an `Audio` element and, on any
failure, invokes `onUnavailable()` (the caller's Web Speech fallback). It returns a
`{ cancel }` handle. It memoizes the played URL per normalized text for the session.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/learner/narrate.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { narrate } from "./narrate";

class FakeAudio {
  src: string;
  onerror: (() => void) | null = null;
  onended: (() => void) | null = null;
  paused = true;
  static last: FakeAudio | null = null;
  constructor(src: string) {
    this.src = src;
    FakeAudio.last = this;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

beforeEach(() => {
  // The suite runs in vitest's `node` environment; narrate guards on `window`,
  // so define a minimal one (the globals it actually uses are stubbed below).
  vi.stubGlobal("window", {});
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  vi.stubGlobal(
    "URL",
    { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} } as unknown as typeof URL,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  FakeAudio.last = null;
});

describe("narrate", () => {
  it("plays the synthesized clip on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    const onUnavailable = vi.fn();
    narrate("Find the word", { onUnavailable });
    await vi.waitFor(() => expect(FakeAudio.last?.paused).toBe(false));
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("falls back when the route responds non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    const onUnavailable = vi.fn();
    narrate("x", { onUnavailable });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
  });

  it("falls back when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const onUnavailable = vi.fn();
    narrate("x", { onUnavailable });
    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
  });

  it("cancel() stops a playing clip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 })),
    );
    const handle = narrate("hello", { onUnavailable: vi.fn() });
    await vi.waitFor(() => expect(FakeAudio.last?.paused).toBe(false));
    handle.cancel();
    expect(FakeAudio.last?.paused).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/components/learner/narrate.test.ts`
Expected: FAIL — cannot find module `./narrate`.

- [ ] **Step 3: Implement**

```ts
// src/components/learner/narrate.ts
"use client";

/**
 * Play English narration from the Kokoro-backed /api/tts route. Audio is an
 * enhancement: on ANY failure (no browser audio, route 4xx/5xx/503, network
 * error, decode/autoplay rejection) we invoke `onUnavailable()` so the caller can
 * speak via the browser Web Speech fallback. Returns a cancel handle.
 */
export type Persist = "durable" | "ephemeral";

export interface NarrateOptions {
  persist?: Persist;
  /** Called when the neural clip cannot be played; speak via browser TTS here. */
  onUnavailable: () => void;
}

export interface NarrateHandle {
  cancel: () => void;
}

/** Session memo: normalized text → object URL already synthesized this session. */
const memo = new Map<string, string>();
const normalize = (t: string): string => t.trim().replace(/\s+/g, " ");

export function narrate(text: string, options: NarrateOptions): NarrateHandle {
  const trimmed = normalize(text);
  if (!trimmed || typeof window === "undefined" || typeof Audio === "undefined") {
    options.onUnavailable();
    return { cancel: () => {} };
  }

  let audio: HTMLAudioElement | null = null;
  let cancelled = false;

  const play = (url: string): void => {
    if (cancelled) return;
    const el = new Audio(url);
    audio = el;
    el.onerror = () => {
      if (audio === el && !cancelled) {
        audio = null;
        options.onUnavailable();
      }
    };
    void el.play().catch(() => {
      if (audio === el && !cancelled) {
        audio = null;
        options.onUnavailable();
      }
    });
  };

  const cached = memo.get(trimmed);
  if (cached) {
    play(cached);
    return { cancel: () => stop() };
  }

  void (async () => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed, persist: options.persist ?? "durable" }),
      });
      if (!res.ok || cancelled) {
        if (!cancelled) options.onUnavailable();
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      memo.set(trimmed, url);
      play(url);
    } catch {
      if (!cancelled) options.onUnavailable();
    }
  })();

  function stop(): void {
    cancelled = true;
    if (audio) {
      audio.onerror = null;
      audio.onended = null;
      audio.pause();
      audio = null;
    }
  }

  return { cancel: stop };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/components/learner/narrate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/learner/narrate.ts src/components/learner/narrate.test.ts
git commit -m "feat(audio): client narrate() with Web Speech fallback"
```

---

## Task 8: Rewire `speak.ts` to Kokoro

**Files:**
- Modify: `src/components/learner/speak.ts`
- Test: `src/components/learner/speak.test.ts`

The current synth body becomes the `onUnavailable` fallback. Public API
(`canSpeak`, `speak`, `stopSpeaking`) is unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/learner/speak.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

const narrate = vi.fn(() => ({ cancel: vi.fn() }));
vi.mock("./narrate", () => ({ narrate }));

import { speak, stopSpeaking } from "./speak";

afterEach(() => vi.resetAllMocks());

describe("speak", () => {
  it("routes English narration through narrate() with persist=durable", () => {
    speak("Find the word");
    expect(narrate).toHaveBeenCalledOnce();
    const [text, opts] = narrate.mock.calls[0];
    expect(text).toBe("Find the word");
    expect(opts.persist).toBe("durable");
    expect(typeof opts.onUnavailable).toBe("function");
  });

  it("ignores empty text", () => {
    speak("   ");
    expect(narrate).not.toHaveBeenCalled();
  });

  it("stopSpeaking cancels the active narration", () => {
    const cancel = vi.fn();
    narrate.mockReturnValueOnce({ cancel });
    speak("hello");
    stopSpeaking();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/components/learner/speak.test.ts`
Expected: FAIL — `speak` still uses speechSynthesis; `narrate` not called.

- [ ] **Step 3: Implement (full file replacement)**

```ts
// src/components/learner/speak.ts
"use client";

/**
 * Audio-first helper. English prompts are voiced by the Kokoro neural voice via
 * the /api/tts route (see narrate); if that is unavailable we fall back to the
 * browser's built-in speech synthesis. Degrades silently where neither works.
 */
import { type NarrateHandle, narrate } from "./narrate";

export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

/** Browser Web Speech delivery — the fallback when Kokoro is unavailable. */
function speakViaSynth(text: string): void {
  if (!canSpeak()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    utterance.lang = "en-US";
    synth.speak(utterance);
  } catch {
    // Speech is an enhancement; failure must never block the child.
  }
}

let active: NarrateHandle | null = null;

/** Speak a short phrase via Kokoro (fallback: browser TTS). Cancels anything in flight. */
export function speak(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  stopSpeaking();
  active = narrate(trimmed, {
    persist: "durable",
    onUnavailable: () => speakViaSynth(trimmed),
  });
}

/** Stop any in-flight narration (clip or utterance). */
export function stopSpeaking(): void {
  if (active) {
    active.cancel();
    active = null;
  }
  if (canSpeak()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // no-op
    }
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/components/learner/speak.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/learner/speak.ts src/components/learner/speak.test.ts
git commit -m "feat(audio): route speak() through Kokoro with synth fallback"
```

---

## Task 9: Rewire `useSpeech` English branch (foreign unchanged)

**Files:**
- Modify: `src/activities/_shared/useSpeech.ts`
- Test: `src/activities/_shared/useSpeech.test.ts`

Only the English branch (`isEnglish(locale)`) routes through `narrate`. Non-English
keeps the existing `speechSynthesis` path verbatim, so `useAudio`'s foreign fallback
is unaffected.

- [ ] **Step 1: Write the failing test**

```ts
// src/activities/_shared/useSpeech.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const narrate = vi.fn(() => ({ cancel: vi.fn() }));
vi.mock("@/components/learner/narrate", () => ({ narrate }));

import { useSpeech } from "./useSpeech";

function stubSynth() {
  const speak = vi.fn();
  const cancel = vi.fn();
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    speak,
    cancel,
  });
  vi.stubGlobal("SpeechSynthesisUtterance", class { lang = ""; rate = 1; pitch = 1; constructor(public text: string) {} });
  return { speak, cancel };
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("useSpeech", () => {
  it("English locale speaks through narrate(), not speechSynthesis", () => {
    const synth = stubSynth();
    const { result } = renderHook(() => useSpeech("en-US"));
    act(() => result.current.speak("Find the word"));
    expect(narrate).toHaveBeenCalledOnce();
    expect(narrate.mock.calls[0][1].persist).toBe("durable");
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("non-English locale keeps the browser speechSynthesis path (no narrate)", () => {
    const synth = stubSynth();
    const { result } = renderHook(() => useSpeech("ko-KR"));
    act(() => result.current.speak("안녕"));
    expect(narrate).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/activities/_shared/useSpeech.test.ts`
Expected: FAIL — English path still calls speechSynthesis; `narrate` not called.

- [ ] **Step 3: Implement**

Modify `src/activities/_shared/useSpeech.ts`. Add the import and a narrate ref; split the
`speak` body so English routes to `narrate` and non-English uses the existing utterance code.

Add near the top (after the existing imports):

```ts
import { type NarrateHandle, narrate } from "@/components/learner/narrate";
```

Add a ref inside the hook (next to the other refs):

```ts
  const narrateRef = useRef<NarrateHandle | null>(null);
```

Replace the existing `speak` `useCallback` with:

```ts
  const speakViaSynth = useCallback(
    (text: string) => {
      const synth = synthRef.current ?? getSynth();
      if (!synth || typeof window === "undefined" || !("SpeechSynthesisUtterance" in window)) {
        return;
      }
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voiceRef.current ?? pickVoice(synth.getVoices(), locale);
      if (voice) utterance.voice = voice;
      utterance.lang = locale;
      const { rate, pitch } = speechParamsFor(locale);
      utterance.rate = rate;
      utterance.pitch = pitch;
      synth.speak(utterance);
    },
    [locale],
  );

  const speak = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      narrateRef.current?.cancel();
      narrateRef.current = null;
      (synthRef.current ?? getSynth())?.cancel();
      if (isEnglish(locale)) {
        // English → Kokoro neural voice (browser TTS fallback inside narrate).
        narrateRef.current = narrate(trimmed, {
          persist: "durable",
          onUnavailable: () => speakViaSynth(trimmed),
        });
        return;
      }
      // Non-English keeps the locale-aware browser voice (foreign clips handled by useAudio).
      speakViaSynth(trimmed);
    },
    [locale, speakViaSynth],
  );
```

Replace the existing `cancel` `useCallback` with:

```ts
  const cancel = useCallback(() => {
    narrateRef.current?.cancel();
    narrateRef.current = null;
    (synthRef.current ?? getSynth())?.cancel();
  }, []);
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/activities/_shared/useSpeech.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full activities suite to confirm no regression**

Run: `bun run test src/activities`
Expected: PASS (existing Player/lang tests unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/activities/_shared/useSpeech.ts src/activities/_shared/useSpeech.test.ts
git commit -m "feat(audio): English useSpeech routes through Kokoro; foreign unchanged"
```

---

## Task 10: Pre-synthesize spoken English at generation time

**Files:**
- Create: `src/lib/audio/spokenFields.ts` (extract child-spoken strings from a config item)
- Create: `src/lib/audio/spokenFields.test.ts`
- Modify: `src/lib/ai/practice.ts` (call `ensureNarration` for each spoken string, best-effort)

- [ ] **Step 1: Write the failing test for the field extractor**

```ts
// src/lib/audio/spokenFields.test.ts
import { describe, expect, it } from "vitest";
import { spokenEnglishStrings } from "./spokenFields";

describe("spokenEnglishStrings", () => {
  it("pulls instruction + passage + question prompts from a reading item", () => {
    const item = {
      instruction: "Read the story.",
      title: "The Cat",
      passage: "A cat sat.",
      questions: [{ prompt: "Who sat?", choices: ["cat", "dog"], answerIndex: 0, kind: "literal" }],
      retellPrompt: "Tell me what happened.",
    };
    expect(spokenEnglishStrings(item)).toEqual([
      "Read the story.",
      "A cat sat.",
      "Who sat?",
      "Tell me what happened.",
    ]);
  });

  it("pulls instruction + words from a sightword item and dedupes/blank-skips", () => {
    const item = { instruction: "Find 'the'.", words: ["the", "the"], decoys: ["teh"] };
    expect(spokenEnglishStrings(item)).toEqual(["Find 'the'.", "the"]);
  });

  it("returns [] for an item with no spoken fields", () => {
    expect(spokenEnglishStrings({ rows: 3, cols: 4, mode: "build" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `bun run test src/lib/audio/spokenFields.test.ts`
Expected: FAIL — cannot find module `./spokenFields`.

- [ ] **Step 3: Implement the extractor**

```ts
// src/lib/audio/spokenFields.ts
/**
 * Which English strings in a generated activity config are read aloud to the
 * child. Used to pre-synthesize narration right after generation so the speaker
 * button is an instant cache hit. Foreign (`lang-*`) configs are handled by the
 * pre-generated clip pipeline and are intentionally NOT covered here.
 */

/** Ordered, de-duplicated, non-blank spoken strings for one config item. */
export function spokenEnglishStrings(item: unknown): string[] {
  if (!item || typeof item !== "object") return [];
  const r = item as Record<string, unknown>;
  const out: string[] = [];
  const push = (v: unknown): void => {
    if (typeof v === "string" && v.trim()) out.push(v);
  };

  push(r.instruction);
  push(r.prompt); // journal-prompt
  push(r.passage); // reading-comprehension
  if (Array.isArray(r.questions)) {
    for (const q of r.questions) {
      if (q && typeof q === "object") push((q as Record<string, unknown>).prompt);
    }
  }
  push(r.retellPrompt);
  if (Array.isArray(r.words)) for (const w of r.words) push(w); // sightword-game targets

  // Stable de-dup (first occurrence wins).
  return [...new Set(out)];
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `bun run test src/lib/audio/spokenFields.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire pre-synth into `generatePracticeItems` (English path only)**

In `src/lib/ai/practice.ts`, add imports at the top:

```ts
import { ensureNarration } from "@/lib/audio/narration";
import { spokenEnglishStrings } from "@/lib/audio/spokenFields";
```

At the END of `generatePracticeItems`, replace the final English return:

```ts
  return result.items as z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[];
```

with:

```ts
  const items = result.items as z.output<(typeof ACTIVITY_CONFIG_SCHEMAS)[K]>[];
  // Fire-and-forget: warm the durable narration cache for everything the child
  // will hear, so the speaker button is an instant hit. Never blocks/breaks the
  // response (ensureNarration swallows its own errors).
  for (const item of items) {
    for (const text of spokenEnglishStrings(item)) void ensureNarration(text);
  }
  return items;
```

(The foreign `isLangKind` branch returns earlier and is untouched.)

- [ ] **Step 6: Run the practice + audio suites**

Run: `bun run test src/lib/ai/practice.test.ts src/lib/audio`
Expected: PASS (existing practice tests still green; new extractor tests green).

- [ ] **Step 7: Commit**

```bash
git add src/lib/audio/spokenFields.ts src/lib/audio/spokenFields.test.ts src/lib/ai/practice.ts
git commit -m "feat(audio): pre-synthesize spoken English at generation time"
```

---

## Task 11: Warm-pass script for static strings

**Files:**
- Create: `scripts/warm-english-audio.ts`

This is a dev/CI tool (like `generate-audio.ts`), not app runtime — no unit test; it is
exercised manually. It enumerates static English strings and calls `ensureNarration`
(durable), so they import the same key scheme the route uses.

- [ ] **Step 1: Implement**

```ts
// scripts/warm-english-audio.ts
/**
 * Warm the DURABLE English narration cache (LOCAL/CI tool).
 *
 * Synthesizes every static English string the kid surface reads aloud — activity
 * instructions, sight words, fixed feedback phrases, and spoken digits 0–20 — via
 * the homelab Kokoro voice and write-throughs each to `en/<ttsKey>.mp3` in MinIO,
 * using the SAME key scheme as /api/tts so warmed clips are guaranteed hits.
 *
 * Requires Kokoro + MinIO write creds in env (see .env.example):
 *   kubectl -n voice port-forward svc/kokoro 8880:8880
 *   KOKORO_URL=http://localhost:8880/v1 \
 *   AUDIO_ORIGIN=http://localhost:9000/kaelyns-academy-audio \
 *   AUDIO_S3_ENDPOINT=localhost:9000 AUDIO_S3_ACCESS_KEY=… AUDIO_S3_SECRET_KEY=… \
 *   AUDIO_S3_BUCKET=kaelyns-academy-audio \
 *   bun run scripts/warm-english-audio.ts
 */
import { ensureNarration } from "@/lib/audio/narration";
import { PROGRAMS } from "@/content";

/** Fixed feedback phrases hardcoded in the English Players (keep in sync). */
const FEEDBACK = [
  "That's it",
  "Hmm, keep looking",
  "You found every word",
];

function staticStrings(): string[] {
  const out = new Set<string>();
  for (const n of Array.from({ length: 21 }, (_, i) => String(i))) out.add(n); // digits 0–20
  for (const f of FEEDBACK) out.add(f);
  // Walk authored program content for instructions / words / passages / prompts.
  for (const program of Object.values(PROGRAMS)) {
    for (const unit of program.units ?? []) {
      for (const activity of unit.activities ?? []) {
        const cfg = (activity as { config?: Record<string, unknown> }).config;
        if (!cfg) continue;
        for (const field of ["instruction", "passage", "prompt", "retellPrompt"]) {
          const v = cfg[field];
          if (typeof v === "string" && v.trim()) out.add(v);
        }
        if (Array.isArray(cfg.words)) for (const w of cfg.words) if (typeof w === "string") out.add(w);
      }
    }
  }
  return [...out].filter((s) => s.trim());
}

async function main(): Promise<void> {
  const strings = staticStrings();
  console.log(`warm-english-audio: ${strings.length} static strings`);
  let stored = 0;
  let missed = 0;
  for (const text of strings) {
    const r = await ensureNarration(text);
    if (r.stored) stored += 1;
    else missed += 1;
  }
  console.log(`Done. durable ${stored}, not-stored ${missed} (check Kokoro/MinIO creds if non-zero).`);
}

void main();
```

> **Adjust to real content shape:** Before running, confirm the `PROGRAMS`/`units`/
> `activities`/`config` accessor names against `src/content/index.ts` and
> `src/content/programs/kaelyn-adaptive.ts`, and update `FEEDBACK` against the actual
> hardcoded strings in the English Players (grep `speech.speak("` / `speak("` in
> `src/activities/*/Player.tsx`). The extractor must not throw on a missing field.

- [ ] **Step 2: Type-check the script compiles**

Run: `bun run typecheck`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add scripts/warm-english-audio.ts
git commit -m "feat(audio): warm-pass script for static English narration"
```

---

## Task 12: Env documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append the new vars**

Add to `.env.example`:

```bash
# --- English neural narration (Kokoro) ---
# Kokoro fastapi base (OpenAI-compatible). Prod: http://kokoro.voice.svc.cluster.local:8880/v1
KOKORO_URL=http://localhost:8880/v1
# English voice + speed for site narration.
KOKORO_EN_VOICE=af_heart
KOKORO_EN_SPEED=0.9
# Scoped MinIO write creds for durable clip write-through (reads stay anonymous via /audio).
# Leave blank in dev to synthesize-and-stream without durable caching.
AUDIO_S3_ENDPOINT=
AUDIO_S3_ACCESS_KEY=
AUDIO_S3_SECRET_KEY=
AUDIO_S3_BUCKET=kaelyns-academy-audio
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(audio): document Kokoro/MinIO narration env vars"
```

---

## Task 13: Full gate + manual verification

- [ ] **Step 1: Run all gates**

Run: `bun run lint && bun run typecheck && bun run test && bun run build`
Expected: all green. Fix any failures before proceeding (max 3 self-fix iterations, then report).

- [ ] **Step 2: Manual smoke (optional, needs Kokoro port-forward)**

```bash
kubectl -n voice port-forward svc/kokoro 8880:8880   # in another shell
KOKORO_URL=http://localhost:8880/v1 bun run dev
# Visit a learner activity; tap the speaker — confirm the Kokoro voice plays.
# Network tab: POST /api/tts → 200 audio/mpeg (first play) or 303 → /audio (cached).
```

- [ ] **Step 3: Commit any fixes, then stop for review**

```bash
git add -A && git commit -m "chore(audio): gate fixes"
```

---

## Out-of-band infra (NOT app code — track separately, do not block this branch)

These live in the homelab GitOps repos, not this app. Note them for the operator:

1. **MinIO write credential** for the app → `AUDIO_S3_*` as a SealedSecret in
   `k3s-infra/k8s/kaelyns-academy/`, mounted into the deployment env. Scope to
   put-object on `kaelyns-academy-audio`.
2. **Lifecycle rule** on the `en/cache/` prefix (expire ~14 days) in the MinIO GitOps
   config (`k3s-infra/k8s/minio/`), e.g. `mc ilm rule add --expire-days 14 --prefix en/cache/ <alias>/kaelyns-academy-audio`.
3. **Warm-pass run** post-deploy: `bun run scripts/warm-english-audio.ts` with creds, then
   spot-check `/audio/en/<key>.mp3` returns 200 `audio/mpeg`.

---

## Self-review checklist (completed by plan author)

- **Spec coverage:** voice/engine (T1,T3) · two-tier cache & addressing (T1,T2,T4) · route hit/miss/503 + dedupe (T6) · client seam + fallback (T7,T8,T9) · foreign untouched (T9 regression test) · pre-synth-on-generation (T10) · warm pass (T11) · env/secret/lifecycle (T12, infra section) · tests (every core task). ✓
- **Placeholders:** none — all steps carry real code/commands. The warm-pass content-accessor names carry an explicit "verify against real shape" note (the one place the content tree must be confirmed at implementation). ✓
- **Type consistency:** `ttsKey(text,voice,speed)`, `ensureNarration(text,opts)→{key,prefix,stored}`, `narrate(text,{persist,onUnavailable})→{cancel}`, `clipExists(prefix,key)`, `putClip(prefix,key,bytes)`, `prefixFor(persist)`, `clipPublicUrl(prefix,key)` used identically across tasks. ✓
