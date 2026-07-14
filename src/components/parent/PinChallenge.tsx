"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyIcon, LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
import {
  clearParentPinByPasswordAction,
  verifyParentPinAction,
} from "@/app/(parent)/pin-actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { Surface } from "@/components/ui/Surface";
import { TextInput } from "@/components/ui/TextInput";

/** Calm, server-backed challenge shown instead of parent route content. */
export function PinChallenge() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (retryAfterSec === null) return;
    const timer = window.setTimeout(() => {
      if (retryAfterSec <= 1) {
        setRetryAfterSec(null);
        setMessage(null);
      } else {
        setRetryAfterSec(retryAfterSec - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfterSec]);

  function submitPin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || retryAfterSec !== null) return;
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await verifyParentPinAction(pin);
        if (result.ok) {
          router.refresh();
          return;
        }
        setMessage(result.message);
        setRetryAfterSec(result.reason === "rate-limited" ? result.retryAfterSec : null);
      } catch {
        setMessage("We could not check the PIN right now. Try again.");
      } finally {
        setPin("");
      }
    });
  }

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setMessage(null);

    startTransition(async () => {
      try {
        const result = await clearParentPinByPasswordAction(password);
        if (result.ok) {
          setRecovered(true);
          return;
        }
        setMessage(result.message);
      } catch {
        setMessage("We could not remove the PIN right now. Try again.");
      } finally {
        setPassword("");
      }
    });
  }

  function switchRecoveryView(nextRecovering: boolean): void {
    setPin("");
    setPassword("");
    setRecovering(nextRecovering);
    setMessage(null);
    setRetryAfterSec(null);
  }

  return (
    <div className="mx-auto flex min-h-[65dvh] max-w-lg items-center">
      <Surface tone="raised" className="w-full p-6 sm:p-8">
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
        >
          <LockKeyIcon weight="regular" className="size-6" />
        </span>

        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
          Grown-up area
        </h1>

        {recovered ? (
          <div className="mt-5 flex flex-col items-start gap-4">
            <StatusMessage tone="success">
              PIN removed — set a new one in Settings.
            </StatusMessage>
            <Button href="/parent/settings#pin" variant="accent" size="md">
              Open Settings
            </Button>
          </div>
        ) : recovering ? (
          <form onSubmit={submitPassword} className="mt-5 flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              Enter your account password to remove the PIN. You can set a new one in Settings.
            </p>
            <Field id="parent-pin-password" label="Account password" error={message ?? undefined}>
              {(field) => (
                <TextInput
                  {...field}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setMessage(null);
                  }}
                  disabled={pending}
                  invalid={message !== null}
                  autoFocus
                />
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="accent" size="md" disabled={pending || !password}>
                {pending ? "Checking…" : "Remove PIN"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                disabled={pending}
                onClick={() => switchRecoveryView(false)}
              >
                Back
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitPin} className="mt-5 flex flex-col gap-4">
            <Field
              id="parent-pin"
              label="Enter your grown-up PIN"
              hint="Use the 4–6 digit PIN you set in Settings."
            >
              {(field) => (
                <TextInput
                  {...field}
                  icon={<KeyIcon weight="regular" className="size-5" />}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (/^\d*$/.test(next)) setPin(next);
                    setMessage(null);
                  }}
                  disabled={pending || retryAfterSec !== null}
                  autoFocus
                />
              )}
            </Field>

            <PinChallengeStatus message={message} retryAfterSec={retryAfterSec} />

            <Button
              type="submit"
              variant="accent"
              size="md"
              disabled={pending || pin.length < 4 || retryAfterSec !== null}
            >
              {pending ? "Checking…" : "Unlock"}
            </Button>
            <button
              type="button"
              onClick={() => switchRecoveryView(true)}
              className="self-start text-sm font-medium text-accent-deep underline-offset-2 hover:underline"
            >
              Forgot PIN?
            </button>
          </form>
        )}
      </Surface>
    </div>
  );
}

export function PinChallengeStatus({
  message,
  retryAfterSec,
}: {
  message: string | null;
  retryAfterSec: number | null;
}) {
  if (!message) return null;
  return (
    <StatusMessage tone="error">
      {retryAfterSec === null ? message : `${message} Try again in ${retryAfterSec} seconds.`}
    </StatusMessage>
  );
}
