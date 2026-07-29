"use client";

import { useEffect, useRef, useState } from "react";
import type { TypingKeysConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Mascot } from "@/components/art/Mascot";
import { Stars } from "@/components/ui/Stars";
import { Prompt, ProgressHint } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { KeyboardMap } from "../_shared/typing/KeyboardMap";
import { TypingStage } from "../_shared/typing/TypingStage";
import { isCapitalKey } from "../_shared/typing/keys";
import { useTypingKeys } from "../_shared/typing/useTypingKeys";
import { expectedPrompts, schema, type TypingKeysResponse } from "./logic";
import { initialKeysState, isKeysComplete, pressNextKey } from "./state";

export function TypingKeysPlayer(props: ActivityPlayerProps<TypingKeysConfig, TypingKeysResponse>) {
  return (
    <TypingStage onExit={props.onExit}>
      <KeysRound {...props} />
    </TypingStage>
  );
}

export function KeyPrompt({ target }: { target: string | null }) {
  if (target === null) {
    return <Mascot mood="cheer" size={96} title="Key Camp complete" />;
  }

  return (
    <p className="text-6xl font-bold text-ink" aria-live="polite">
      {target === " "
        ? "space"
        : isCapitalKey(target)
          ? `⇧ + ${target}`
          : target.toUpperCase()}
    </p>
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
      <KeyPrompt target={target} />
      {(parsed.showHands ?? true) && <KeyboardMap target={target} />}
      <div className="flex flex-col items-center gap-2">
        {/* Decorative fill-up only: its "N of M stars" name would collide with
            the 1-3 reward stars and double the ProgressHint announcement. */}
        <span aria-hidden="true">
          <Stars value={state.index} max={prompts.length} size="sm" />
        </span>
        <ProgressHint>
          {Math.min(state.index + 1, prompts.length)} of {prompts.length}
        </ProgressHint>
      </div>
    </div>
  );
}
