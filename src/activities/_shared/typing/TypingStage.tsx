"use client";

import { useState, type ReactNode } from "react";
import { KeyboardIcon } from "@phosphor-icons/react/dist/ssr";
import { useSpeakOnce } from "../useSpeakOnce";
import { useSpeech } from "../useSpeech";
import { PROVE_KEY, gateState, isProofKey } from "./gate";
import { useCoarsePointerOnly } from "./useCoarsePointerOnly";
import { useTypingKeys } from "./useTypingKeys";

/**
 * The gate + stage wrapper EVERY typing Player renders through.
 *
 * Deliberately not a route layout: generated and shelf hosts mount Players
 * directly, and a layout-only gate would leak straight through them (the same
 * mistake the parent PIN gate had to correct). Gating at the Player boundary is
 * the only placement that cannot be bypassed.
 */
export function TypingStage({ children }: { children: ReactNode }) {
  const coarsePointerOnly = useCoarsePointerOnly();
  const [keyboardProven, setKeyboardProven] = useState(false);
  const state = gateState({ coarsePointerOnly, keyboardProven });
  const speech = useSpeech();
  const spokenInstruction =
    state === "blocked"
      ? "Typing needs a real keyboard, so come back on a computer."
      : `Press the ${PROVE_KEY.toUpperCase()} key to start with your left pointer finger.`;

  useSpeakOnce(speech.speak, spokenInstruction);

  // Keep listening even while blocked: attaching a keyboard case to a tablet
  // should just work, with no reload and no settings toggle.
  useTypingKeys((intent) => {
    if (intent.type === "char" && isProofKey(intent)) setKeyboardProven(true);
  }, state !== "open");

  if (state === "open") return <>{children}</>;

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <KeyboardIcon size={72} weight="duotone" className="text-honey" aria-hidden />
      {state === "blocked" ? (
        <>
          <h2 className="text-2xl font-semibold text-ink">Typing needs a keyboard</h2>
          <p className="max-w-sm text-ink-soft">
            This game is for a computer with real keys. See you there!
          </p>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold text-ink">
            Press the <kbd className="rounded-xl bg-honey/30 px-3 py-1">{PROVE_KEY.toUpperCase()}</kbd> key to start
          </h2>
          <p className="max-w-sm text-ink-soft">
            Feel the little bump on it? That is where your left pointer finger lives.
          </p>
        </>
      )}
    </div>
  );
}
