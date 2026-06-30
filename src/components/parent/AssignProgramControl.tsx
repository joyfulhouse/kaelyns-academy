"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  PlusCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { assignProgramAction } from "@/app/(parent)/actions";
import {
  ENROLLMENT_STATUS_PILL_TONE,
  ENROLLMENT_STATUS_LABEL_ASSIGN,
} from "@/lib/status-display";
import type { LearnerWithStatus } from "@/app/(parent)/data";

type ActionState =
  | { status: "idle" }
  | { status: "error"; learnerId: string; message: string };

/**
 * Per-learner assign controls for the program-detail page. Shows each child's
 * current enrollment status for this program and an "Assign" button when the
 * child is not yet enrolled (or was removed). Uses useAsyncAction for the
 * transition; the error is kept keyed by learnerId so it renders under the right
 * child (the hook's `onError` callback sets that keyed state).
 */
export function AssignProgramControl({
  slug,
  learners,
}: {
  slug: string;
  learners: LearnerWithStatus[];
}) {
  const router = useRouter();
  const { run, pending } = useAsyncAction();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  // Only announce to screen readers after a real successful assignment — not on
  // initial idle mount (which would otherwise read a spurious "updated").
  const [announce, setAnnounce] = useState(false);

  function handleAssign(learnerId: string) {
    if (pending) return;
    setActionState({ status: "idle" });
    setAnnounce(false);

    run(() => assignProgramAction(learnerId, slug), {
      onSuccess: () => {
        setAnnounce(true);
        router.refresh();
      },
      errorMessage: (result) => result.message ?? "Could not assign the program.",
      onError: (message) => setActionState({ status: "error", learnerId, message }),
      fallbackMessage: "Could not assign the program. Please try again.",
    });
  }

  if (learners.length === 0) {
    return (
      <p className="mt-4 text-sm text-ink-soft">
        No learners on this account yet. Add a learner first.
      </p>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-3">
      {learners.map((learner) => {
        const err =
          actionState.status === "error" && actionState.learnerId === learner.id
            ? actionState.message
            : undefined;

        const canAssign = learner.status === "none" || learner.status === "removed";

        return (
          <Surface key={learner.id} tone="raised" className="flex flex-wrap items-center justify-between gap-3 border border-line p-4">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-ink">{learner.displayName}</p>
              {err && (
                <StatusMessage tone="error" className="mt-1">
                  {err}
                </StatusMessage>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {learner.status !== "none" && (
                <Pill tone={ENROLLMENT_STATUS_PILL_TONE[learner.status]}>
                  {ENROLLMENT_STATUS_LABEL_ASSIGN[learner.status]}
                </Pill>
              )}

              {learner.status === "active" ? (
                <Button
                  href={`/parent/learners/${learner.id}`}
                  variant="soft"
                  size="sm"
                >
                  <CheckCircleIcon weight="regular" className="size-4" />
                  View progress
                </Button>
              ) : canAssign ? (
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={() => handleAssign(learner.id)}
                  disabled={pending}
                >
                  <PlusCircleIcon weight="regular" className="size-4" />
                  {pending ? "Assigning…" : "Assign"}
                </Button>
              ) : null}
            </div>
          </Surface>
        );
      })}

      {/* Screen-reader success feedback — only after a real successful action. */}
      {announce && actionState.status === "idle" && !pending && (
        <p className="sr-only" role="status">
          Assignments updated.
        </p>
      )}
    </div>
  );
}
