"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  ArrowCounterClockwiseIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { Select } from "@/components/ui/Select";
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

/**
 * Parent curriculum panel for a learner-detail page. Lists enrolled programs
 * with their status and config, lets the parent remove/restore them, and
 * offers an "add a program" control for the published catalog.
 *
 * Wires to the Task 3.1 server actions using the AddChildForm pattern:
 * useTransition + call in startTransition(async () => …) + router.refresh().
 */
export function CurriculumPanel({
  learnerId,
  curriculum,
}: {
  learnerId: string;
  curriculum: LearnerCurriculumProps;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  const [selectedSlug, setSelectedSlug] = useState("");

  const { enrolled, available } = curriculum;

  function callAction(
    slug: string,
    action: (learnerId: string, slug: string) => Promise<{ ok: boolean; message?: string }>,
  ) {
    if (isPending) return;
    setActionState({ status: "idle" });

    startTransition(async () => {
      try {
        const result = await action(learnerId, slug);
        if (result.ok) {
          router.refresh();
        } else {
          setActionState({
            status: "error",
            slug,
            message: result.message ?? "Something went wrong.",
          });
        }
      } catch {
        setActionState({
          status: "error",
          slug,
          message: "Could not update the program. Please try again.",
        });
      }
    });
  }

  function handleRemove(slug: string) {
    callAction(slug, (lid, s) => removeProgramAction(lid, s));
  }

  function handleRestore(slug: string) {
    callAction(slug, (lid, s) => restoreProgramAction(lid, s));
  }

  function handleAdd() {
    if (!selectedSlug || isPending) return;
    setActionState({ status: "idle" });

    startTransition(async () => {
      try {
        const result = await assignProgramAction(learnerId, selectedSlug);
        if (result.ok) {
          setSelectedSlug("");
          router.refresh();
        } else {
          setActionState({
            status: "error",
            slug: selectedSlug,
            message: result.message ?? "Could not assign the program.",
          });
        }
      } catch {
        setActionState({
          status: "error",
          slug: selectedSlug,
          message: "Could not assign the program. Please try again.",
        });
      }
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
        <div className="mt-5 grid place-items-center rounded-xl border border-dashed border-line-strong p-10 text-center">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
          >
            <BookOpenIcon weight="regular" className="size-5" />
          </span>
          <p className="mt-3 font-display text-base font-semibold">No programs yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            Add a program below to get this learner started.
          </p>
        </div>
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
                        disabled={isPending}
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
                        disabled={isPending}
                        aria-label={`Restore ${program.title}`}
                      >
                        <ArrowCounterClockwiseIcon weight="regular" className="size-4" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>

                {actionErr && (
                  <p
                    role="alert"
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-danger"
                  >
                    <WarningCircleIcon weight="regular" className="size-4" />
                    {actionErr}
                  </p>
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
              disabled={isPending}
              className="max-w-xs"
              aria-label="Select a program to add"
            />

            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={handleAdd}
              disabled={isPending || !selectedSlug}
            >
              <PlusIcon weight="bold" className="size-4" />
              {isPending ? "Adding…" : "Add"}
            </Button>

            {actionState.status === "error" && actionState.slug === selectedSlug && (
              <span
                role="alert"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"
              >
                <WarningCircleIcon weight="regular" className="size-4" />
                {actionState.message}
              </span>
            )}

            {actionState.status === "idle" && !selectedSlug && (
              <span className="text-sm text-ink-faint" aria-live="polite" />
            )}
          </div>
        )}
      </div>

      {/* Global success feedback */}
      {actionState.status === "idle" && isPending === false && (
        <p className="sr-only" role="status">
          Programs updated.
        </p>
      )}
    </section>
  );
}

