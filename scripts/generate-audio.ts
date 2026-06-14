/**
 * Pre-generate World Languages audio clips on macOS (LOCAL DEV TOOL ONLY).
 *
 * For every `ScriptEntry.spoken` in each `LanguageDef`, synthesize a clip with
 * the system `say` voice and transcode it to AAC/.m4a at
 * `public/audio/<locale>/<id>.m4a`. The hybrid audio layer (`useAudio`) plays
 * these when present and falls back to browser TTS otherwise.
 *
 * CI MUST NOT run this: it needs macOS `say`/`afconvert`, and in production the
 * clips ship from the storage backend behind AUDIO_BASE_URL — not from the repo.
 * Idempotent: existing outputs are skipped, so it's safe to re-run after content
 * edits to fill in only the new entries.
 *
 *   bun run scripts/generate-audio.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageDef } from "@/content/languages/types";

/** macOS `say` voice per locale (all are standard, installable system voices). */
const VOICE_BY_LOCALE: Record<string, string> = {
  "zh-TW": "Meijia",
  "es-MX": "Paulina",
  "ja-JP": "Kyoko",
  "ko-KR": "Yuna",
  "en-US": "Samantha",
};

const PUBLIC_AUDIO_DIR = join(process.cwd(), "public", "audio");
const MANIFEST_PATH = join(PUBLIC_AUDIO_DIR, "manifest.json");

/**
 * Load the authored languages. Prefer a `LANGUAGES` collection from the package
 * index; if a sibling hasn't added it yet, fall back to the individual files so
 * this tool still works during the content build-out.
 */
async function loadLanguages(): Promise<LanguageDef[]> {
  // Computed specifier so `tsc` doesn't hard-fail when the index file doesn't
  // exist yet (a sibling owns it); resolved purely at runtime when present.
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

function main(): void {
  if (process.platform !== "darwin") {
    console.log("generate-audio: macOS-only (needs `say` + `afconvert`). Skipping on this platform.");
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

  const manifest: Record<string, boolean> = {};
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  const tmp = mkdtempSync(join(tmpdir(), "ka-audio-"));
  try {
    for (const lang of languages) {
      const voice = VOICE_BY_LOCALE[lang.locale] ?? VOICE_BY_LOCALE["en-US"];
      const outDir = join(PUBLIC_AUDIO_DIR, lang.locale);
      mkdirSync(outDir, { recursive: true });
      console.log(`\n${lang.locale} (${lang.displayName}) — voice ${voice}, ${lang.inventory.length} entries`);

      for (const entry of lang.inventory) {
        const key = `${lang.locale}/${entry.id}`;
        const out = join(outDir, `${entry.id}.m4a`);
        if (existsSync(out)) {
          manifest[key] = true;
          skipped += 1;
          continue;
        }
        const aiff = join(tmp, `${entry.id}.aiff`);
        try {
          // say → AIFF, then afconvert → AAC in an MPEG-4 container (.m4a).
          execFileSync("say", ["-v", voice, "-o", aiff, entry.spoken]);
          execFileSync("afconvert", [aiff, "-d", "aac", "-f", "m4af", out]);
          rmSync(aiff, { force: true });
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
    `\nDone. generated ${generated}, skipped ${skipped}` +
      (failed > 0 ? `, failed ${failed}` : "") +
      `. Manifest: ${MANIFEST_PATH} (${Object.keys(manifest).length} clips).`,
  );
}

main();
