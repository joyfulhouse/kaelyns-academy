"use client";

import { useEffect, useRef, useState } from "react";
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
import { initialKeysState, isKeysComplete, pressNextKey } from "./state";

export function TypingKeysPlayer(props: ActivityPlayerProps<TypingKeysConfig, TypingKeysResponse>) {
  return (
    <TypingStage>
      <KeysRound {...props} />
    </TypingStage>
  );
}

function KeysRound({
  config,
  onComplete,
}: ActivityPlayerProps<TypingKeysConfig, TypingKeysResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const prompts = expectedPrompts(parsed);
  const [state, setState] = useState(initialKeysState);
  const reported = useRef(false);
  const complete = isKeysComplete(state, prompts.length);
  const target = complete ? null : (prompts[state.index] ?? null);

  useSpeakOnce(speech.speak, parsed.instruction);

  useTypingKeys((intent) => {
    if (intent.type !== "char") return;
    setState((current) => pressNextKey(current, prompts, intent));
  }, !complete);

  // Completion is reported after React commits the final transition. Keeping
  // this side effect out of the functional updater makes it StrictMode-safe,
  // while the ref prevents callback identity changes from reporting twice.
  useEffect(() => {
    if (!complete || reported.current) return;
    reported.current = true;
    onComplete({ prompts: state.done });
  }, [complete, onComplete, state.done]);

  return (
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
  );
}
