// scripts/warm-english-audio.ts
/**
 * Warm the DURABLE English narration cache (LOCAL/CI tool).
 *
 * Synthesizes every static English string the kid surface reads aloud — activity
 * instructions, passages, prompts, sight words, fixed feedback phrases, and
 * spoken digits 0–20 — via the homelab Kokoro voice and write-throughs each to
 * `en/<ttsKey>.mp3` in MinIO, using the SAME key scheme as /api/tts so warmed
 * clips are guaranteed hits.
 *
 * Requires Kokoro + MinIO write creds in env (see .env.example):
 *   kubectl -n voice port-forward svc/kokoro 8880:8880
 *   KOKORO_URL=http://localhost:8880/v1 \
 *   AUDIO_ORIGIN=http://localhost:9000/kaelyns-academy-audio \
 *   AUDIO_S3_ENDPOINT=localhost:9000 AUDIO_S3_ACCESS_KEY=… AUDIO_S3_SECRET_KEY=… \
 *   AUDIO_S3_BUCKET=kaelyns-academy-audio \
 *   bun run scripts/warm-english-audio.ts
 */
import { PROGRAMS } from "@/content";
import { ensureNarration } from "@/lib/audio/narration";
import { spokenEnglishStrings } from "@/lib/audio/spokenFields";

/**
 * Fixed feedback phrases hardcoded in the English Players (keep in sync with the
 * `speech.speak("…")` literals in `src/activities/<kind>/Player.tsx`). Positive
 * and corrective phrases the child hears that are NOT carried in authored config.
 */
const FEEDBACK = [
  "So close. Let's try that one again.", // phonics-wordbuild
  "That's it.", // reading-comprehension
  "Good thinking. Look again and pick another one.", // reading-comprehension
  "Hmm, keep looking.", // sightword-game
  "That's a little too many. Try again.", // math-tenframe
  "A few more. Try again.", // math-tenframe
  "That's a little too many. Count again.", // math-array
  "A little more. Count again.", // math-array
];

function staticStrings(): string[] {
  const out = new Set<string>();
  // Spoken digits 0–20 (tenframe / array readouts).
  for (let i = 0; i <= 20; i += 1) out.add(String(i));
  for (const f of FEEDBACK) out.add(f);

  // Walk every authored activity config (units → lessons → activities → config)
  // and pull each child-spoken English field via the same extractor the
  // generation-time pre-synth uses. Defensive optional access throughout: any
  // missing layer or field is simply skipped, never thrown on.
  for (const program of PROGRAMS) {
    for (const unit of program.units ?? []) {
      for (const lesson of unit.lessons ?? []) {
        for (const activity of lesson.activities ?? []) {
          const config = (activity as { config?: unknown }).config;
          for (const text of spokenEnglishStrings(config)) out.add(text);
        }
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
  console.log(
    `Done. durable ${stored}, not-stored ${missed} (check Kokoro/MinIO creds if non-zero).`,
  );
}

void main();
