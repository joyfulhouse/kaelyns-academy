"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  PlusIcon,
  TrashIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { EnrollmentConfigForm } from "@/components/parent/EnrollmentConfigForm";
import {
  assignProgramAction,
  removeProgramAction,
  restoreProgramAction,
} from "@/app/(parent)/actions";
import { canTransitionStatus } from "@/lib/tutor/enrollment";
import {
  ENROLLMENT_STATUS_LABEL,
  ENROLLMENT_STATUS_PILL_TONE,
} from "@/lib/status-display";
import type { LearnerCurriculumProps } from "@/lib/parent-views";

type ActionState =
  | { status: "idle" }
  | { status: "error"; slug: string; message: string };

/** The shared enrollment server-action result, without importing the action's
 *  (non-exported) result type — assign/remove/restore all return this shape. */
type EnrollmentResult = Awaited<ReturnType<typeof assignProgramAction>>;

/**
 * Parent curriculum panel for a learner-detail page. Lists enrolled programs
 * with their status and config, lets the parent remove/restore them, and
 * offers an "add a program" control for the published catalog.
 *
 * Wires to the enrollment server actions via useAsyncAction; the error is kept
 * keyed by program slug (set through the hook's `onError`) so it renders under
 * the right program.
 */
export function CurriculumPanel({
  learnerId,
  curriculum,
}: {
  learnerId: string;
  curriculum: LearnerCurriculumProps;
}) {
  const router = useRouter();
  const { run, pending } = useAsyncAction();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  const [selectedSlug, setSelectedSlug] = useState("");
  // Only announce to screen readers after a real successful action — not on the
  // initial idle mount (which would otherwise read a spurious "updated").
  const [announce, setAnnounce] = useState(false);

  const { enrolled, available } = curriculum;

  function callAction(
    slug: string,
    action: (learnerId: string, slug: string) => Promise<EnrollmentResult>,
  ) {
    if (pending) return;
    setActionState({ status: "idle" });
    setAnnounce(false);

    run(() => action(learnerId, slug), {
      onSuccess: () => {
        setAnnounce(true);
        router.refresh();
      },
      errorMessage: (result) => result.message ?? "Something went wrong.",
      onError: (message) => setActionState({ status: "error", slug, message }),
      fallbackMessage: "Could not update the program. Please try again.",
    });
  }

  function handleRemove(slug: string) {
    callAction(slug, (lid, s) => removeProgramAction(lid, s));
  }

  function handleRestore(slug: string) {
    callAction(slug, (lid, s) => restoreProgramAction(lid, s));
  }

  function handleAdd() {
    if (!selectedSlug || pending) return;
    setActionState({ status: "idle" });
    setAnnounce(false);

    run(() => assignProgramAction(learnerId, selectedSlug), {
      onSuccess: () => {
        setSelectedSlug("");
        setAnnounce(true);
        router.refresh();
      },
      errorMessage: (result) => result.message ?? "Could not assign the program.",
      onError: (message) => setActionState({ status: "error", slug: selectedSlug, message }),
      fallbackMessage: "Could not assign the program. Please try again.",
    });
  }

  const addOptions = [
    { value: "", label: "Choose a program…" },
    ...available.map((p) => ({ value: p.slug, label: p.title })),
  ];

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-tight">Curriculum</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Programs assigned to this learner. Configure each one or remove it at any time.
      </p>

      {enrolled.length === 0 ? (
        <EmptyState
          className="mt-8 p-12"
          icon={<BookOpenIcon weight="regular" className="size-10 text-ink-faint" />}
          title="No programs yet"
          description="Add a program below to get this learner started."
        />
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          {enrolled.map((program) => {
            const actionErr =
              actionState.status === "error" && actionState.slug === program.slug
                ? actionState.message
                : undefined;

            const canRemove =
              canTransitionStatus(program.status, "removed") &&
              program.status !== "removed";
            const canRestore =
              program.status === "removed" &&
              canTransitionStatus(program.status, "active");

            return (
              <Surface
                key={program.slug}
                tone="raised"
                className="border border-line p-5"
              >
                {/* Program header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-base font-semibold text-ink">
                      {program.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-faint">{program.slug}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Pill tone={ENROLLMENT_STATUS_PILL_TONE[program.status]}>
                      {ENROLLMENT_STATUS_LABEL[program.status]}
                    </Pill>

                    {canRemove && (
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={() => handleRemove(program.slug)}
                        disabled={pending}
                        aria-label={`Remove ${program.title}`}
                      >
                        <TrashIcon weight="regular" className="size-4" />
                        Remove
                      </Button>
                    )}

                    {canRestore && (
                      <Button
                        type="button"
                        variant="soft"
                        size="sm"
                        onClick={() => handleRestore(program.slug)}
                        disabled={pending}
                        aria-label={`Restore ${program.title}`}
                      >
                        <ArrowCounterClockwiseIcon weight="regular" className="size-4" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>

                {actionErr && (
                  <StatusMessage tone="error" className="mt-2">
                    {actionErr}
                  </StatusMessage>
                )}

                {/* Config form — only for non-removed programs */}
                {program.status !== "removed" && (
                  <EnrollmentConfigForm
                    learnerId={learnerId}
                    slug={program.slug}
                    units={program.units}
                    config={program.config}
                  />
                )}
              </Surface>
            );
          })}
        </div>
      )}

      {/* Add a program */}
      <div className="mt-6">
        <h3 className="font-display text-base font-semibold tracking-tight">Add a program</h3>

        {available.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No additional programs available to add right now.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Select
              options={addOptions}
              value={selectedSlug}
              onChange={(e) => {
                setSelectedSlug(e.target.value);
                setActionState({ status: "idle" });
              }}
              disabled={pending}
              className="max-w-xs"
              aria-label="Select a program to add"
            />

            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={handleAdd}
              disabled={pending || !selectedSlug}
            >
              <PlusIcon weight="bold" className="size-4" />
              {pending ? "Adding…" : "Add"}
            </Button>

            {actionState.status === "error" && actionState.slug === selectedSlug && (
              <StatusMessage tone="error">{actionState.message}</StatusMessage>
            )}

            {actionState.status === "idle" && !selectedSlug && (
              <span className="text-sm text-ink-faint" aria-live="polite" />
            )}
          </div>
        )}
      </div>

      {/* Global success feedback — only after a real successful action. */}
      {announce && actionState.status === "idle" && !pending && (
        <p className="sr-only" role="status">
          Programs updated.
        </p>
      )}
    </section>
  );
}
