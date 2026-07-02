"use client";

import { useState } from "react";
import type { MathClockConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { Prompt, PlayerControls } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { schema, score, type MathClockResponse } from "./logic";

export function MathClockPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathClockConfig, MathClockResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();

  const [attempts, setAttempts] = useState(0);
  const [done, setDone] = useState<MathClockResponse | null>(null);

  useSpeakOnce(speech.speak, parsed.instruction);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="Great job with telling time!"
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  const handleReadChoice = (index: number) => {
    setAttempts((a) => a + 1);
    setDone({ attempts: attempts + 1, selectedIndex: index });
  };

  const handleSetClock = (hour: number, minute: number) => {
    setAttempts((a) => a + 1);
    setDone({ attempts: attempts + 1, setHour: hour, setMinute: minute });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />
      {parsed.mode === "read" && (
        <div className="flex flex-wrap gap-4 justify-center">
          {parsed.choices.map((choice, i) => (
            <Button
              key={i}
              size="kid"
              variant="primary"
              onClick={() => handleReadChoice(i)}
            >
              {choice}
            </Button>
          ))}
        </div>
      )}
      {parsed.mode === "set" && (
        <div className="flex flex-col gap-4 items-center">
          <p className="text-lg">Set the clock to {parsed.targetHour}:{parsed.targetMinute === 0 ? "00" : "30"}</p>
          <Button
            size="kid"
            variant="primary"
            onClick={() => handleSetClock(parsed.targetHour, parsed.targetMinute)}
          >
            I set the clock
          </Button>
        </div>
      )}
      <PlayerControls>
        <Button size="kid" variant="soft" onClick={() => handleReadChoice(0)}>
          Skip
        </Button>
      </PlayerControls>
    </div>
  );
}
