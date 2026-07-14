"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandTapIcon } from "@phosphor-icons/react/dist/ssr";
import { lockParentAreaAction } from "@/app/(parent)/pin-actions";
import { Button } from "@/components/ui/Button";
import { writeKey } from "@/components/learner/localStore";

/** Build the handoff route from opaque ids only; display names are never URLs. */
export function buildHandoffHref(programSlug: string, learnerId: string): string {
  return `/learn/${encodeURIComponent(programSlug)}?handoff=${encodeURIComponent(learnerId)}`;
}

interface HandoffDependencies {
  lockParentArea: () => Promise<{ ok: true } | { ok: false; message?: string }>;
  writeSelection: (learnerId: string) => boolean;
  navigate: (href: string) => void;
}

/** Complete every fallible handoff step before leaving the parent surface. */
export async function completeHandoff(
  learnerId: string,
  programSlug: string,
  dependencies: HandoffDependencies,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!dependencies.writeSelection(learnerId)) {
    return {
      ok: false,
      message: "We could not select that learner on this device. Check browser storage and try again.",
    };
  }

  const lockResult = await dependencies.lockParentArea();
  if (!lockResult.ok) {
    return {
      ok: false,
      message: lockResult.message ?? "We could not lock the grown-up area. Try again.",
    };
  }

  dependencies.navigate(buildHandoffHref(programSlug, learnerId));
  return { ok: true };
}

/** Select a household learner and carry the shared device straight to their map. */
export function HandoffButton({
  learnerId,
  learnerName,
  programSlug = "kaelyn-adaptive",
}: {
  learnerId: string;
  learnerName: string;
  programSlug?: string;
}) {
  const router = useRouter();
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handOff(): Promise<void> {
    if (locking) return;

    setLocking(true);
    setError(null);
    try {
      const result = await completeHandoff(learnerId, programSlug, {
        lockParentArea: lockParentAreaAction,
        writeSelection: (id) => writeKey("ka:account-learner", id),
        navigate: (href) => router.replace(href),
      });
      if (!result.ok) {
        setError(result.message);
      }
    } catch {
      // Fail closed: if the lock request did not settle, keep the device on the
      // parent surface instead of navigating with a possibly valid unlock cookie.
      setError("We could not lock the grown-up area. Try again.");
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="accent"
        size="md"
        disabled={locking}
        aria-busy={locking}
        onClick={() => void handOff()}
      >
        <HandTapIcon weight="bold" className="size-5" />
        Hand the device to {learnerName}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
