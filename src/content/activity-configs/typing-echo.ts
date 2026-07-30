import { z } from "zod";

export const typingEchoConfig = z
  .object({
    instruction: z.string().trim().min(1).max(240),
    /** Each sequence is 2–4 characters: long enough to hold, short enough to
     *  recall without reading. */
    sequences: z.array(z.string().trim().min(2).max(4)).min(3).max(10),
    /**
     * A MINIMUM, not a fixed duration: actual on-screen time is
     * `max(flashMs, this sequence's spoken-form duration)` (Player.tsx's
     * `holdForSequenceSpeech`) — recall never opens while the essential-
     * content utterance is still the only channel conveying the sequence to
     * a blind child. For most authored sequences the SPEECH binds, not this
     * number: e.g. `big-echo-caps`'s authored 1400ms never actually applies,
     * since its capitalized sequences' spoken form runs ~1700ms+. One
     * consequence for future authors: a flash can no longer be made SHORTER
     * than its own utterance, so a speed-drill variant (fast flash, terse or
     * no narration) isn't expressible under the current design — that would
     * need its own opt-out of the speech-settle hold, not just a lower
     * `flashMs`.
     */
    flashMs: z.number().int().min(400).max(2_000).default(1_200),
  })
  .strict();
export type TypingEchoConfig = z.input<typeof typingEchoConfig>;
