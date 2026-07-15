import { z } from "zod";

// Authored-only, listen-first oral reading. The word branch intentionally keeps
// the original v1 fields and defaults its discriminator so the five existing
// word-oral-* configs remain unchanged at authoring and seed boundaries.
const oralReadingWordConfig = z.object({
  // `optional().transform(...)` lets Zod's discriminator recognize both an
  // absent v1 mode and the explicit literal, then resolves the parsed config
  // to the canonical word branch. (`literal().default()` is selected too late
  // for a discriminated union in Zod 4.)
  mode: z
    .literal("word")
    .optional()
    .transform((mode) => mode ?? "word"),
  instruction: z.string().trim().min(1).max(200),
  target: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => value.split(/\s+/).length <= 6, "target must be six words or fewer"),
  // Authored activities carry `skillTag` so emitted evidence stays inside the
  // activity's `skillTags`; omission is allowed for evidence-free review items.
  skillTag: z.string().trim().min(1).max(64).optional(),
});
export type OralReadingWordConfig = z.input<typeof oralReadingWordConfig>;

export const oralReadingSentenceConfig = z.object({
  mode: z.literal("sentence"),
  instruction: z.string().trim().min(1).max(200),
  // A sentence must be read within the kaelyn-stt service's 15s decoded-speech
  // cap. At the ~30 WCPM grade-1 target that is ~7 words, so keep passages
  // short (the recording ceiling in recording.ts is derived to match).
  passage: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine(
      (value) => value.split(/\s+/).length <= 7,
      "passage must be seven words or fewer",
    )
    .refine((value) => /[a-z0-9]/i.test(value), "passage must contain a word or number"),
  skillTag: z.string().trim().min(1).max(64).optional(),
});
export type OralReadingSentenceConfig = z.input<typeof oralReadingSentenceConfig>;

export const oralReadingConfig = z.discriminatedUnion("mode", [
  oralReadingWordConfig,
  oralReadingSentenceConfig,
]);
export type OralReadingConfig = z.input<typeof oralReadingConfig>;
