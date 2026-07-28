"use client";

import { useState } from "react";
import type { TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { KeyboardMap } from "../_shared/typing/KeyboardMap";
import { TypingStage } from "../_shared/typing/TypingStage";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { expectedPrompts, schema, type TypingKeysResponse } from "./logic";
import { initialKeysState, isKeysComplete, pressKey } from "./state";

export function TypingKeysPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<TypingKeysConfig, TypingKeysResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const prompts = expectedPrompts(parsed);
  const [state, setState] = useState(initialKeysState);
  const complete = isKeysComplete(state, prompts.length);
  const target = complete ? null : (prompts[state.index] ?? null);

  useSpeakOnce(speech.speak, parsed.instruction);

  useTypingKeys((intent) => {
    if (intent.type !== "char" || target === null) return;
    const next = pressKey(state, target, intent.char);
    setState(next);
    if (isKeysComplete(next, prompts.length)) onComplete({ prompts: next.done });
  }, !complete);

  return (
    <TypingStage>
      <div className="flex flex-col items-center gap-8">
        <Prompt speech={speech} instruction={parsed.instruction} />
        <p className="text-6xl font-bold text-ink" aria-live="polite">
          {target === null ? "🎉" : target === " " ? "space" : target.toUpperCase()}
        </p>
        {(parsed.showHands ?? true) && <KeyboardMap target={target} />}
        <ProgressHint>
          {Math.min(state.index + 1, prompts.length)} of {prompts.length}
        </ProgressHint>
      </div>
    </TypingStage>
  );
}
