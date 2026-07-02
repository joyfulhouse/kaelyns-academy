"use client";

import { useState } from "react";
import type { MathMeasureConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { Prompt, PlayerControls } from "../_shared/ActivityChrome";
import { RewardOverlay } from "../_shared/RewardOverlay";
import { useActivity } from "../_shared/useActivity";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { schema, score, type MathMeasureResponse } from "./logic";

export function MathMeasurePlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathMeasureConfig, MathMeasureResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();

  const [attempts, setAttempts] = useState(0);
  const [done, setDone] = useState<MathMeasureResponse | null>(null);

  useSpeakOnce(speech.speak, parsed.instruction);

  if (done) {
    const result = score(parsed, done);
    return (
      <RewardOverlay
        stars={result.stars}
        message="Great job measuring!"
        onContinue={() => onComplete(done, result)}
      />
    );
  }

  const handleCompareChoice = (index: number) => {
    setAttempts((a) => a + 1);
    setDone({ attempts: attempts + 1, selectedIndex: index });
  };

  const handleUnitsGuess = (length: number) => {
    setAttempts((a) => a + 1);
    setDone({ attempts: attempts + 1, guessedLength: length });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />
      {parsed.mode === "compare" && (
        <div className="flex flex-col gap-4 items-center">
          {parsed.items.map((item, i) => (
            <button
              key={i}
              onClick={() => handleCompareChoice(i)}
              className="text-4xl hover:scale-110 transition-transform"
            >
              {item.emoji}
            </button>
          ))}
        </div>
      )}
      {parsed.mode === "units" && (
        <div className="flex flex-col gap-4 items-center">
          <p className="text-lg">How many units long?</p>
          <input
            type="number"
            min={0}
            max={20}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleUnitsGuess(parseInt(e.currentTarget.value, 10));
              }
            }}
            placeholder="Enter length"
            className="px-4 py-2 border rounded-lg"
          />
        </div>
      )}
      <PlayerControls>
        <Button size="kid" variant="soft" onClick={() => handleCompareChoice(0)}>
          Skip
        </Button>
      </PlayerControls>
    </div>
  );
}
