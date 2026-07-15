import { z } from "zod";

export const sightwordGameConfig = z.object({
  instruction: z.string(),
  words: z.array(z.string()).min(2), // the target sight words
  decoys: z.array(z.string()).default([]),
  // Authored skill this game evidences (e.g. word.morphology.prefixes). When
  // omitted the game defaults to reading.decodable (Program-01 behavior).
  skillTag: z.string().min(1).max(64).optional(),
});
export type SightwordGameConfig = z.input<typeof sightwordGameConfig>;
