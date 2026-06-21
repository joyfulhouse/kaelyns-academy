# Generated phonics pronunciation — known limitation & follow-up

**Status:** accepted known limitation (product decision 2026-06-21). Tracking the
proper fix here.

## Context

Phonics word-build tiles are spoken in isolation, so Kokoro's G2P mis-reads a bare
fragment (lone `c` → "see", `ble` → "blee"). The fix attaches a per-tile IPA
override sent to Kokoro as `[tile](/ipa/)`.

- **Authored** activities (`src/content/programs/*.ts`) carry **hand-verified**
  `say`/`silent`/word `ipa`. These are correct and are the pilot's actual
  curriculum. (This was the reported bug — fully fixed.)
- **AI-generated** practice (`/api/practice` → `generatePracticeItems`, kind
  `phonics-wordbuild`) has the model emit `say` overrides, which are then validated
  server-side against Kokoro ground truth in `applyRepair`
  (`src/lib/ai/practice.ts`) and dropped (→ bare) unless positively confirmed.

## The limitation

`applyRepair` is a best-effort sanity net, **not** a proof, because it has no
grapheme→phoneme **alignment**: Kokoro's `POST /dev/phonemize` returns a flat
phoneme string with no per-letter offsets, and phonemizing a tile's letters in
isolation reproduces the very out-of-context bug we're fixing. A kept generated
override is validated to be (a) spellable by the tile's own letters, (b) consonant-
bearing, (c) plausible — its consonants an in-order subsequence of the word's — for
**every** word using the tile, and (d) backed by full ground truth. That closes the
common hallucinations, but two rare classes still pass:

1. **Vowel quality** — a kept override's vowel is not validated (vowels legitimately
   vary by word; validating them would false-reject correct overrides). The LLM's
   vowel is trusted.
2. **Consonant position** — a consonant the tile *can* spell that also occurs
   elsewhere in the word passes even when it isn't the tile's actual sound. Example:
   tiles `s,c,a,t` for `scat` with `say.c = "s"` — "c" can spell soft /s/ and /s/ is
   present (from the `s` tile), so it passes, though "c" in "scat" is /k/.

Both require a model double-coincidence (a hallucinated override that *also* happens
to be tile-spellable and present elsewhere), affect only the supplementary
AI-generated path (never authored content), and the validation **only ever removes**
overrides — so on average generated audio is improved (consonants/digraphs/blends
fixed) and the residual is bounded.

## Proper fix (follow-up)

Introduce grapheme→phoneme **alignment** so each tile's pronunciation is derived/
validated at its own position in the word. Options:

- Run **misaki** with token/offset output (it has richer info than kokoro-fastapi's
  `/dev/phonemize` surfaces) behind a small service that returns per-grapheme
  phoneme spans, then derive each tile's IPA directly from ground truth (no LLM
  trust needed) — this also fixes the vowel class.
- Or a forced aligner over synthesized audio.

With aligned spans, `applyRepair` can validate (or outright derive) per-tile IPA,
closing both residual classes and letting generated phonics match authored quality.

## Where the code lives

- `src/lib/ai/practice.ts` — `applyRepair` / `repairPhonicsBatch` /
  `sanitizeGeneratedPhonics` (generated-only).
- `src/lib/audio/phonemeCheck.ts` — `plausibleOverride`, `hasConsonant`,
  `tileAllowsConsonants` (pure checks).
- `src/lib/audio/phonemize.ts` — Kokoro `/dev/phonemize` client.
- `src/lib/audio/phonemes.ts` — `withPhonemes` markup (shared by Player + warm).
