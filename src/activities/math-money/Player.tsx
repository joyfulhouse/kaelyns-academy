"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import { coinsTotal, schema, type Coin, type MathMoneyResponse } from "./logic";

/** Per-coin display: a static map (JIT-safe, no dynamic class construction). */
const COIN_META: Record<Coin, { label: string; cents: string; emoji: string }> = {
  penny: { label: "Penny", cents: "1¢", emoji: "🟤" },
  nickel: { label: "Nickel", cents: "5¢", emoji: "⚪" },
  dime: { label: "Dime", cents: "10¢", emoji: "🔘" },
  quarter: { label: "Quarter", cents: "25¢", emoji: "🪙" },
};

export function MathMoneyPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathMoneyConfig, MathMoneyResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [attempts, setAttempts] = useState(0);
  const [tray, setTray] = useState<Coin[]>([]); // count mode only: coins dropped so far

  // Read the instruction aloud once when the activity opens.
  useSpeakOnce(speech.speak, parsed.instruction);

  function tapIdentify(coin: Coin) {
    if (parsed.mode !== "identify" || shake.wrong) return;
    const attemptCount = attempts + 1;
    if (coin === parsed.targetCoin) {
      const response: MathMoneyResponse = { attempts: attemptCount, tappedCoin: coin };
      onComplete(response);
    } else {
      setAttempts(attemptCount);
      shake.trigger({ speak: () => speech.speak("Try another coin.") });
    }
  }

  function addCoin(coin: Coin) {
    if (parsed.mode !== "count" || shake.wrong) return;
    setTray((prev) => [...prev, coin]);
  }

  function removeCoin(index: number) {
    if (parsed.mode !== "count" || shake.wrong) return;
    setTray((prev) => prev.filter((_, i) => i !== index));
  }

  function clearTray() {
    setTray([]);
  }

  function check() {
    if (parsed.mode !== "count") return;
    const attemptCount = attempts + 1;
    setAttempts(attemptCount);
    const total = coinsTotal(tray);
    if (total === parsed.targetCents) {
      const response: MathMoneyResponse = { attempts: attemptCount, tappedCoins: tray };
      onComplete(response);
    } else {
      shake.trigger({
        speak: () =>
          speech.speak(
            total > parsed.targetCents
              ? "That's a little too much. Try again."
              : "A little more. Try again.",
          ),
      });
    }
  }

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {parsed.mode === "identify" ? (
        <motion.div
          className="mx-auto grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3"
          {...shake.shakeProps(reduced)}
        >
          {parsed.coins.map((coin, i) => (
            <CoinTile
              key={`${coin}-${i}`}
              coin={coin}
              onTap={() => tapIdentify(coin)}
              disabled={shake.wrong}
            />
          ))}
        </motion.div>
      ) : (
        <>
          <motion.div className="grid justify-items-center gap-6" {...shake.shakeProps(reduced)}>
            <Tray coins={tray} onRemove={removeCoin} disabled={shake.wrong} />
            <div className="mx-auto grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-4">
              {parsed.palette.map((coin) => (
                <CoinTile key={coin} coin={coin} onTap={() => addCoin(coin)} disabled={shake.wrong} />
              ))}
            </div>
          </motion.div>

          <ProgressHint>
            {tray.length === 0 ? "Tap coins to add them to the tray" : `${coinsTotal(tray)}¢ so far`}
          </ProgressHint>
        </>
      )}

      <PlayerControls>
        {parsed.mode === "count" && (
          <Button
            variant="soft"
            size="md"
            onClick={clearTray}
            disabled={tray.length === 0 || shake.wrong}
          >
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Clear
          </Button>
        )}
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {parsed.mode === "count" && (
          <Button variant="primary" size="kid" onClick={check} disabled={shake.wrong}>
            Check it
          </Button>
        )}
      </PlayerControls>
    </div>
  );
}

/** A big, tappable coin: the emoji glyph plus its cents label. Shared by the
 *  identify grid (tap the target coin) and the count palette (add to the tray). */
function CoinTile({
  coin,
  onTap,
  disabled,
}: {
  coin: Coin;
  onTap: () => void;
  disabled: boolean;
}) {
  const meta = COIN_META[coin];
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={`${meta.label}, ${meta.cents}`}
      className={cn(
        "grid min-h-24 place-items-center gap-1 rounded-2xl border-[3px] border-ink bg-paper-raised px-4 py-5 text-ink shadow-pop transition duration-200 ease-out",
        "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <span className="text-4xl" role="img" aria-hidden="true">
        {meta.emoji}
      </span>
      <span className="font-display text-lg">{meta.cents}</span>
    </button>
  );
}

/** The count-mode tray: dropped coins with the running total always visible
 *  (no dark pattern), removable by tapping them back out. */
function Tray({
  coins,
  onRemove,
  disabled,
}: {
  coins: Coin[];
  onRemove: (index: number) => void;
  disabled: boolean;
}) {
  return (
    <div
      role="list"
      aria-label="Coins in the tray"
      className="flex min-h-20 w-full max-w-md flex-wrap items-center justify-center gap-2 rounded-2xl border-[3px] border-dashed border-ink/25 bg-paper-sunk p-3"
    >
      {coins.length === 0 ? (
        <span className="text-sm text-ink-soft">Empty tray</span>
      ) : (
        coins.map((coin, i) => {
          const meta = COIN_META[coin];
          return (
            <button
              key={i}
              type="button"
              onClick={() => onRemove(i)}
              disabled={disabled}
              aria-label={`Remove ${meta.label} from the tray`}
              className={cn(
                "grid min-h-24 min-w-24 place-items-center rounded-full border-2 border-ink bg-paper-raised text-3xl shadow-pop transition duration-200 ease-out",
                "hover:-translate-y-0.5 active:translate-y-0.5",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <span role="img" aria-hidden="true">
                {meta.emoji}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
