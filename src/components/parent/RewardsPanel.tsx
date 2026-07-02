"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { GiftIcon, StarIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { grantBonusStarsAction } from "@/app/(parent)/actions";
import type { RewardsLedgerRow } from "@/app/(parent)/data";

/**
 * Parse the bonus-stars text field into the value we both validate against and
 * submit, so the two can never disagree. Matches digits only (`/^\d+$/`) so
 * browser-accepted number syntax like `1e1` or `5.5` can't silently coerce to a
 * different granted amount — bounded 1–20 (mirrors the server's zod schema in
 * `grantBonusStarsAction`).
 */
export function parseBonusAmount(raw: string): { value: number | undefined; valid: boolean } {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return { value: undefined, valid: false };
  const value = Number(trimmed);
  if (value < 1 || value > 20) return { value: undefined, valid: false };
  return { value, valid: true };
}

/**
 * Parent Rewards panel (Task 10 / spec §3.1, §5): the learner's current star
 * balance, their newest ~10 ledger entries with friendly reason copy, and a
 * "Give bonus stars" control (1–20) for an offline win. Same
 * useAsyncAction + router.refresh()-on-success plumbing as
 * {@link EnrollmentConfigForm}; the numeric-field parse/validate split mirrors
 * that form's `parseDailyGoal`.
 */
export function RewardsPanel({
  learnerId,
  learnerName,
  balance,
  ledger,
}: {
  learnerId: string;
  learnerName: string;
  balance: number;
  ledger: RewardsLedgerRow[];
}) {
  const router = useRouter();
  const amountId = useId();
  const [amount, setAmount] = useState("5");
  const { run, pending, error, succeeded, reset } = useAsyncAction();

  const { value: parsedAmount, valid: amountValid } = parseBonusAmount(amount);
  const amountError = amountValid ? undefined : "Enter a whole number from 1 to 20.";

  function handleGrant() {
    if (pending || amountError || parsedAmount === undefined) return;
    run(() => grantBonusStarsAction(learnerId, parsedAmount), {
      onSuccess: () => {
        setAmount("5");
        router.refresh();
      },
      fallbackMessage: "Could not grant bonus stars. Please try again.",
    });
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Rewards</h2>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-honey/20 px-3.5 py-1.5 text-sm font-semibold text-ink">
          <StarIcon weight="fill" className="size-4 text-honey" aria-hidden />
          {balance} {balance === 1 ? "star" : "stars"}
        </span>
      </div>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        {learnerName}&rsquo;s star balance and recent activity, plus a bonus for an offline win.
      </p>

      {ledger.length === 0 ? (
        <p className="mt-5 text-sm text-ink-faint">No star activity yet.</p>
      ) : (
        <ul className="mt-5 overflow-hidden rounded-xl border border-line">
          {ledger.map((entry, i) => (
            <li
              key={`${entry.createdAt}-${i}`}
              className={`flex items-center justify-between gap-3 px-5 py-3 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{entry.reasonLabel}</p>
                <p className="text-xs text-ink-faint">{entry.when}</p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold ${entry.delta < 0 ? "text-ink-soft" : "text-success"}`}
              >
                {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-5">
        <Field id={amountId} label="Give bonus stars" hint="For an offline win (1–20)." error={amountError}>
          {(field) => (
            <TextInput
              {...field}
              type="number"
              min={1}
              max={20}
              step={1}
              invalid={Boolean(amountError)}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                reset();
              }}
              disabled={pending}
              className="max-w-[120px]"
            />
          )}
        </Field>

        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={handleGrant}
          disabled={pending || Boolean(amountError)}
        >
          <GiftIcon weight="regular" className="size-4" />
          {pending ? "Giving…" : "Give bonus stars"}
        </Button>

        {succeeded && <StatusMessage tone="success">Bonus stars given.</StatusMessage>}
        {error !== null && <StatusMessage tone="error">{error}</StatusMessage>}
      </div>
    </section>
  );
}
