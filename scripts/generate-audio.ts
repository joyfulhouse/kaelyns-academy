/**
 * Pre-generate World Languages audio clips on macOS (LOCAL DEV TOOL ONLY).
 *
 * For every `ScriptEntry.spoken` in each `LanguageDef`, synthesize a clip and
 * transcode it to AAC/.m4a at `public/audio/<locale>/<id>.m4a`. The hybrid audio
 * layer (`useAudio`) plays these when present and falls back to browser TTS.
 *
 * Two TTS backends, chosen per language:
 *  - **Kokoro** (the homelab neural voices, kokoro-fastapi OpenAI API) for the
 *    languages it does natively + naturally: Spanish + Japanese. Reach it via a
 *    port-forward and set KOKORO_URL (default http://localhost:8880/v1):
 *      kubectl -n voice port-forward svc/kokoro 8880:8880
 *  - **macOS `say`** for Korean (Kokoro has no Korean voice) and Zhuyin (Kokoro
 *    Mandarin wants pinyin/hanzi, not Bopomofo) — and as the fallback for every
 *    language when Kokoro is unreachable.
 *
 * CI MUST NOT run this: it needs macOS `afconvert` (+ `say`), and in production
 * the clips ship from the storage backend behind AUDIO_BASE_URL, not the repo.
 * Idempotent: existing outputs are skipped, so re-running fills only new entries.
 *
 *   kubectl -n voice port-forward svc/kokoro 8880:8880   # for the Kokoro voices
 *   bun run scripts/generate-audio.ts
 */
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageDef } from "@/content/languages/types";

type Engine = "say" | "kokoro";

/** Per-locale TTS backend: the engine + its voice, plus the macOS `say` voice to
 *  use when the engine is Kokoro but Kokoro is unreachable. */
interface Backend {
  engine: Engine;
  /** Kokoro voice id (when engine is "kokoro"). */
  kokoroVoice?: string;
  /** macOS `say` voice — used for engine "say" and as the Kokoro fallback. */
  sayVoice: string;
  /** Kokoro speaking rate (0.25–4.0); a touch slow for young ears. */
  speed?: number;
}

const BACKEND_BY_LOCALE: Record<string, Backend> = {
  // Kokoro has no Korean, and its Mandarin path wants pinyin/hanzi not Bopomofo,
  // so zh-TW + ko-KR stay on `say`. es/ja read their native text on Kokoro.
  "zh-TW": { engine: "say", sayVoice: "Meijia" },
  "es-MX": { engine: "kokoro", kokoroVoice: "ef_dora", sayVoice: "Paulina", speed: 0.9 },
  "ja-JP": { engine: "kokoro", kokoroVoice: "jf_alpha", sayVoice: "Kyoko", speed: 0.9 },
  "ko-KR": { engine: "say", sayVoice: "Yuna" },
  "en-US": { engine: "say", sayVoice: "Samantha" },
};

const KOKORO_URL = (process.env.KOKORO_URL ?? "http://localhost:8880/v1").replace(/\/$/, "");
const PUBLIC_AUDIO_DIR = join(process.cwd(), "public", "audio");
const MANIFEST_PATH = join(PUBLIC_AUDIO_DIR, "manifest.json");

/**
 * Load the authored languages. Prefer a `LANGUAGES` collection from the package
 * index; if a sibling hasn't added it yet, fall back to the individual files so
 * this tool still works during the content build-out.
 */
async function loadLanguages(): Promise<LanguageDef[]> {
  const indexSpecifier = ["@/content", "languages"].join("/");
  try {
    const mod = (await import(indexSpecifier)) as Record<string, unknown>;
    const coll = mod.LANGUAGES ?? mod.languages ?? mod.default;
    if (Array.isArray(coll)) return coll as LanguageDef[];
    if (coll && typeof coll === "object") return Object.values(coll) as LanguageDef[];
  } catch {
    // index not present yet — fall through to per-file imports
  }
  const names = ["zhuyin", "spanish", "japanese", "korean"] as const;
  const langs: LanguageDef[] = [];
  for (const name of names) {
    try {
      const mod = (await import(`@/content/languages/${name}`)) as Record<string, unknown>;
      const def = mod[name] ?? mod.default;
      if (def && typeof def === "object") langs.push(def as LanguageDef);
    } catch {
      console.warn(`  ! skipped ${name}: module not importable yet`);
    }
  }
  return langs;
}

/** One-time reachability check so we can warn + fall back cleanly when the
 *  port-forward isn't up, instead of failing every Kokoro clip. */
async function kokoroReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${KOKORO_URL}/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Synthesize `text` to `out` (.m4a). Returns the engine actually used. */
async function synth(
  backend: Backend,
  text: string,
  out: string,
  tmp: string,
  id: string,
  kokoroUp: boolean,
): Promise<Engine> {
  if (backend.engine === "kokoro" && backend.kokoroVoice && kokoroUp) {
    try {
      const res = await fetch(`${KOKORO_URL}/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "kokoro",
          input: text,
          voice: backend.kokoroVoice,
          response_format: "wav",
          speed: backend.speed ?? 1,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`kokoro ${res.status}`);
      const wav = join(tmp, `k-${id}.wav`);
      writeFileSync(wav, Buffer.from(await res.arrayBuffer()));
      execFileSync("afconvert", [wav, "-d", "aac", "-f", "m4af", out]);
      rmSync(wav, { force: true });
      return "kokoro";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ~ ${id}: kokoro failed (${msg}); using say`);
    }
  }
  // say → AIFF, then afconvert → AAC in an MPEG-4 container (.m4a).
  const aiff = join(tmp, `s-${id}.aiff`);
  execFileSync("say", ["-v", backend.sayVoice, "-o", aiff, text]);
  execFileSync("afconvert", [aiff, "-d", "aac", "-f", "m4af", out]);
  rmSync(aiff, { force: true });
  return "say";
}

function main(): void {
  if (process.platform !== "darwin") {
    console.log("generate-audio: macOS-only (needs `afconvert` + `say`). Skipping on this platform.");
    process.exit(0);
  }
  void run();
}

async function run(): Promise<void> {
  const languages = await loadLanguages();
  if (languages.length === 0) {
    console.log("generate-audio: no LanguageDefs found under @/content/languages — nothing to do.");
    process.exit(0);
  }

  const wantsKokoro = Object.values(BACKEND_BY_LOCALE).some((b) => b.engine === "kokoro");
  const kokoroUp = wantsKokoro ? await kokoroReachable() : false;
  if (wantsKokoro && !kokoroUp) {
    console.warn(
      `! Kokoro not reachable at ${KOKORO_URL} — using macOS \`say\` everywhere.\n` +
        "  Start it with:  kubectl -n voice port-forward svc/kokoro 8880:8880",
    );
  }

  const manifest: Record<string, boolean> = {};
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const byEngine: Record<Engine, number> = { say: 0, kokoro: 0 };

  const tmp = mkdtempSync(join(tmpdir(), "ka-audio-"));
  try {
    for (const lang of languages) {
      const backend = BACKEND_BY_LOCALE[lang.locale] ?? BACKEND_BY_LOCALE["en-US"];
      const engineLabel =
        backend.engine === "kokoro" && kokoroUp ? `kokoro:${backend.kokoroVoice}` : `say:${backend.sayVoice}`;
      const outDir = join(PUBLIC_AUDIO_DIR, lang.locale);
      mkdirSync(outDir, { recursive: true });
      console.log(`\n${lang.locale} (${lang.displayName}) — ${engineLabel}, ${lang.inventory.length} entries`);

      for (const entry of lang.inventory) {
        const key = `${lang.locale}/${entry.id}`;
        const out = join(outDir, `${entry.id}.m4a`);
        if (existsSync(out)) {
          manifest[key] = true;
          skipped += 1;
          continue;
        }
        try {
          const used = await synth(backend, entry.spoken, out, tmp, entry.id, kokoroUp);
          byEngine[used] += 1;
          manifest[key] = true;
          generated += 1;
        } catch (err) {
          failed += 1;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`  ! ${key}: ${msg}`);
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  mkdirSync(PUBLIC_AUDIO_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `\nDone. generated ${generated} (kokoro ${byEngine.kokoro}, say ${byEngine.say}), skipped ${skipped}` +
      (failed > 0 ? `, failed ${failed}` : "") +
      `. Manifest: ${MANIFEST_PATH} (${Object.keys(manifest).length} clips).`,
  );
}

main();
