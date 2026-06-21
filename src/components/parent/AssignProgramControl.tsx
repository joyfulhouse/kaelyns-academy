"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  PlusCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
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
 * child is not yet enrolled (or was removed). Uses the AddChildForm pattern:
 * useTransition + startTransition(async) + router.refresh().
 */
export function AssignProgramControl({
  slug,
  learners,
}: {
  slug: string;
  learners: LearnerWithStatus[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });

  function handleAssign(learnerId: string) {
    if (isPending) return;
    setActionState({ status: "idle" });

    startTransition(async () => {
      try {
        const result = await assignProgramAction(learnerId, slug);
        if (result.ok) {
          router.refresh();
        } else {
          setActionState({
            status: "error",
            learnerId,
            message: result.message ?? "Could not assign the program.",
          });
        }
      } catch {
        setActionState({
          status: "error",
          learnerId,
          message: "Could not assign the program. Please try again.",
        });
      }
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
                <p
                  role="alert"
                  className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-danger"
                >
                  <WarningCircleIcon weight="regular" className="size-4" />
                  {err}
                </p>
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
                  disabled={isPending}
                >
                  <PlusCircleIcon weight="regular" className="size-4" />
                  {isPending ? "Assigning…" : "Assign"}
                </Button>
              ) : null}
            </div>
          </Surface>
        );
      })}

      {/* Screen-reader success feedback */}
      {actionState.status === "idle" && !isPending && (
        <p className="sr-only" role="status">
          Assignments updated.
        </p>
      )}
    </div>
  );
}
