"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import type { MathMoneyConfig } from "@/content/activity-configs";
import type { ActivityPlayerProps } from "@/content/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PlayerControls, Prompt, ProgressHint, SpeakerButton } from "../_shared/ActivityChrome";
import { useActivity } from "../_shared/useActivity";
import { useReducedMotion } from "../_shared/useReducedMotion";
import { useSpeakOnce } from "../_shared/useSpeakOnce";
import { useSpeech } from "../_shared/useSpeech";
import { useWrongShake } from "../_shared/useWrongShake";
import {
  COIN_FACTS,
  MAX_COIN_TOKENS,
  addCoin as addCoinToken,
  removeCoin as removeCoinToken,
  sumCoins,
  type Coin,
  type CoinToken,
} from "./coin-model";
import { schema, type MathMoneyResponse } from "./logic";

const COIN_FILL: Record<Coin, string> = {
  penny: "#c9825f",
  nickel: "#d8d5ca",
  dime: "#ece9df",
  quarter: "#c8c8c1",
};

function spokenCents(cents: number): string {
  return `${cents} ${cents === 1 ? "cent" : "cents"}`;
}

export function MathMoneyPlayer({
  config,
  onComplete,
}: ActivityPlayerProps<MathMoneyConfig, MathMoneyResponse>) {
  const parsed = useActivity(schema, config);
  const speech = useSpeech();
  const reduced = useReducedMotion();
  const shake = useWrongShake();

  const [attempts, setAttempts] = useState(0);
  const [tray, setTray] = useState<CoinToken[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const nextToken = useRef(1);

  useSpeakOnce(speech.speak, parsed.instruction);

  function tapIdentify(coin: Coin) {
    if (parsed.mode !== "identify" || shake.wrong) return;
    const attemptCount = Math.min(attempts + 1, 20);
    if (coin === parsed.targetCoin) {
      const response: MathMoneyResponse = { attempts: attemptCount, tappedCoin: coin };
      onComplete(response);
      return;
    }
    const message = "That is a different coin. Look at the name and value, then try again.";
    setAttempts(attemptCount);
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak("Try another coin.") });
  }

  function canAddCoin(coin: Coin): boolean {
    if (parsed.mode !== "count" || tray.length >= MAX_COIN_TOKENS) return false;
    return sumCoins(tray) + COIN_FACTS[coin].cents <= parsed.targetCents;
  }

  function addCoin(coin: Coin) {
    if (parsed.mode !== "count" || shake.wrong || !canAddCoin(coin)) return;
    const token: CoinToken = { id: `coin-${nextToken.current}`, type: coin };
    nextToken.current += 1;
    const nextTray = addCoinToken(tray, token);
    setTray(nextTray);
    setFeedback(null);
    setAnnouncement(
      `Added ${COIN_FACTS[coin].name}. Tray total ${spokenCents(sumCoins(nextTray))}.`,
    );
  }

  function removeCoin(tokenId: string) {
    if (parsed.mode !== "count" || shake.wrong) return;
    const token = tray.find((candidate) => candidate.id === tokenId);
    if (!token) return;
    const nextTray = removeCoinToken(tray, tokenId);
    setTray(nextTray);
    setFeedback(null);
    setAnnouncement(
      `Removed ${COIN_FACTS[token.type].name}. Tray total ${spokenCents(sumCoins(nextTray))}.`,
    );
  }

  function clearTray() {
    setTray([]);
    setFeedback(null);
    setAnnouncement("Cleared the tray. Tray total zero cents.");
  }

  function check() {
    if (parsed.mode !== "count" || shake.wrong) return;
    const attemptCount = Math.min(attempts + 1, 20);
    const total = sumCoins(tray);
    setAttempts(attemptCount);
    if (total === parsed.targetCents) {
      const response: MathMoneyResponse = { attempts: attemptCount, tokens: [...tray] };
      onComplete(response);
      return;
    }
    const message =
      total > parsed.targetCents
        ? "That is a little too much. Keep your coins and try again."
        : "You need a little more. Keep your coins and try again.";
    setFeedback(message);
    shake.trigger({ speak: () => speech.speak(message) });
  }

  const trayTotal = sumCoins(tray);

  return (
    <div className="grid gap-8">
      <Prompt speech={speech} instruction={parsed.instruction} />

      {parsed.mode === "identify" ? (
        <motion.div
          role="group"
          aria-label="Coin choices"
          className="mx-auto grid max-w-2xl grid-cols-2 items-end gap-4 sm:grid-cols-3"
          {...shake.shakeProps(reduced)}
        >
          {parsed.coins.map((coin, index) => (
            <CoinButton
              key={`${coin}-${index}`}
              coin={coin}
              action="Choose"
              onClick={() => tapIdentify(coin)}
              disabled={shake.wrong}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div className="grid justify-items-center gap-6" {...shake.shakeProps(reduced)}>
          <CoinTray tokens={tray} onRemove={removeCoin} disabled={shake.wrong} />

          <div
            role="group"
            aria-label="Coin palette"
            className="mx-auto grid max-w-2xl grid-cols-2 items-end gap-4 sm:grid-cols-4"
          >
            {parsed.palette.map((coin, index) => (
              <CoinButton
                key={`${coin}-${index}`}
                coin={coin}
                action="Add"
                onClick={() => addCoin(coin)}
                disabled={shake.wrong || !canAddCoin(coin)}
              />
            ))}
          </div>
        </motion.div>
      )}

      {parsed.mode === "count" ? (
        <ProgressHint>
          <span className="block font-display text-lg text-ink">
            Tray total: {spokenCents(trayTotal)}
          </span>
          {tray.length > 0 ? (
            <span className="block">
              {tray.map((token) => COIN_FACTS[token.type].cents).join(" + ")} = {trayTotal}¢
            </span>
          ) : (
            <span className="block">Tap a coin to add it. Tap a tray coin to remove it.</span>
          )}
          {feedback ? <span className="mt-2 block font-semibold text-ink">{feedback}</span> : null}
        </ProgressHint>
      ) : feedback ? (
        <ProgressHint className="font-semibold text-ink">{feedback}</ProgressHint>
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <PlayerControls>
        {parsed.mode === "count" ? (
          <Button
            variant="soft"
            size="md"
            onClick={clearTray}
            disabled={tray.length === 0 || shake.wrong}
          >
            <ArrowCounterClockwiseIcon weight="bold" aria-hidden="true" />
            Clear
          </Button>
        ) : null}
        <SpeakerButton speech={speech} text={parsed.instruction} label="Hear what to do again" />
        {parsed.mode === "count" ? (
          <Button variant="primary" size="kid" onClick={check} disabled={shake.wrong}>
            Check it
          </Button>
        ) : null}
      </PlayerControls>
    </div>
  );
}

function CoinButton({
  coin,
  action,
  onClick,
  disabled,
}: {
  coin: Coin;
  action: "Add" | "Choose";
  onClick: () => void;
  disabled: boolean;
}) {
  const fact = COIN_FACTS[coin];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${action} ${fact.name}, ${spokenCents(fact.cents)}`}
      className={cn(
        "grid min-h-28 min-w-24 place-items-center gap-2 rounded-2xl border-[3px] border-ink bg-paper-raised px-3 py-4 text-ink shadow-pop transition duration-200 ease-out",
        "hover:-translate-y-0.5 active:translate-y-1 active:shadow-none",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <CoinFace coin={coin} />
      <span className="font-display text-base">
        {fact.name} · {fact.cents}¢
      </span>
    </button>
  );
}

function CoinTray({
  tokens,
  onRemove,
  disabled,
}: {
  tokens: CoinToken[];
  onRemove: (tokenId: string) => void;
  disabled: boolean;
}) {
  function removeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, tokenId: string) {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    onRemove(tokenId);
  }

  return (
    <div
      role="list"
      aria-label="Coins in the tray"
      className="flex min-h-32 w-full max-w-2xl flex-wrap items-end justify-center gap-3 rounded-3xl border-[3px] border-dashed border-ink/30 bg-paper-sunk p-4"
    >
      {tokens.length === 0 ? (
        <span className="self-center text-sm text-ink-soft">The tray is empty.</span>
      ) : (
        tokens.map((token) => {
          const fact = COIN_FACTS[token.type];
          return (
            <div key={token.id} role="listitem">
              <button
                type="button"
                onClick={() => onRemove(token.id)}
                onKeyDown={(event) => removeWithKeyboard(event, token.id)}
                disabled={disabled}
                aria-label={`Remove ${fact.name}, ${spokenCents(fact.cents)}`}
                className="grid min-h-24 min-w-24 place-items-center rounded-2xl border-2 border-transparent transition hover:border-ink focus-visible:border-ink focus-visible:outline-none active:translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
              >
                <CoinFace coin={token.type} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

function CoinFace({ coin }: { coin: Coin }) {
  const fact = COIN_FACTS[coin];
  const displayDiameter = fact.diameter * 3;
  const shortName = coin === "quarter" ? "25¢" : `${fact.cents}¢`;
  return (
    <svg
      viewBox="0 0 72 72"
      width={displayDiameter}
      height={displayDiameter}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="36" cy="36" r="32" fill={COIN_FILL[coin]} stroke="var(--color-ink)" strokeWidth="3" />
      <circle cx="36" cy="36" r="26" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
      <path d="M18 25 Q36 14 54 25" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
      <text
        x="36"
        y="34"
        textAnchor="middle"
        fill="var(--color-ink)"
        fontSize="9"
        fontWeight="700"
      >
        {fact.name.toUpperCase()}
      </text>
      <text
        x="36"
        y="49"
        textAnchor="middle"
        fill="var(--color-ink)"
        fontSize="15"
        fontWeight="800"
      >
        {shortName}
      </text>
    </svg>
  );
}
