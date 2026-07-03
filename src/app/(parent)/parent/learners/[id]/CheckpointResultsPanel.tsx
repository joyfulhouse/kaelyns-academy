"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { Surface } from "@/components/ui/Surface";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { applyPlacementAction, redoCheckpointAction } from "@/app/(parent)/actions";
import { getSkill } from "@/content";
import type { PlacementBand } from "@/lib/placement/placement";
import type { CheckpointForParent } from "@/app/(parent)/data";

/** Friendly, honest copy per placement band — never "mastered", never a grade. */
const BAND_LABEL: Record<PlacementBand, string> = {
  breezed: "She's got this",
  mixed: "Practicing",
  not_yet: "We'll teach it",
};

const BAND_TONE: Record<PlacementBand, PillTone> = {
  breezed: "success",
  mixed: "ready",
  not_yet: "neutral",
};

/** The shared action result, without importing the (non-exported) action
 *  return type directly — mirrors CurriculumPanel's `EnrollmentResult`. */
type CheckpointActionResult = Awaited<ReturnType<typeof applyPlacementAction>>;

/** Error kept keyed by checkpoint id (same idiom as CurriculumPanel's
 *  slug-keyed `ActionState`) so it renders under the right card. */
type ActionState = { status: "idle" } | { status: "error"; id: string; message: string };

/**
 * Parent "Check-in results" panel (Adventure 2.0 C1 / Task 5, spec §3.5): one
 * card per baseline checkpoint. A `pending` result shows the per-skill
 * verdicts plus an explicit Apply/Redo choice — nothing about the learner's
 * skill_state changes until the parent applies it (never auto-applied). An
 * `applied` result renders as a quiet confirmation line instead. Renders
 * nothing when the learner has no checkpoint history yet.
 *
 * Wired to applyPlacementAction/redoCheckpointAction via useAsyncAction; all
 * cards' buttons disable while any one action is in flight (same guard shape
 * as CurriculumPanel's remove/restore buttons), with the in-flight card
 * tracked separately so only its own button reads "Applying…"/"Redoing…".
 */
export function CheckpointResultsPanel({
  learnerId,
  checkpoints,
}: {
  learnerId: string;
  checkpoints: CheckpointForParent[];
}) {
  const router = useRouter();
  const { run, pending } = useAsyncAction();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  // Track BOTH which card AND which action is in flight, so only the button
  // that was clicked reads "Applying…"/"Redoing…" — not its sibling.
  const [activeAction, setActiveAction] = useState<{ id: string; kind: "apply" | "redo" } | null>(
    null,
  );

  if (checkpoints.length === 0) return null;

  function callAction(
    id: string,
    kind: "apply" | "redo",
    action: (learnerId: string, checkpointResultId: string) => Promise<CheckpointActionResult>,
  ) {
    if (pending) return;
    setActionState({ status: "idle" });
    setActiveAction({ id, kind });

    run(() => action(learnerId, id), {
      onSuccess: () => {
        setActiveAction(null);
        router.refresh();
      },
      errorMessage: (result) => result.message ?? "Something went wrong.",
      onError: (message) => {
        setActiveAction(null);
        setActionState({ status: "error", id, message });
      },
      fallbackMessage: "Could not update the check-in. Please try again.",
    });
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-tight">Check-in results</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        What a check-in found, skill by skill. Nothing changes until you apply it.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        {checkpoints.map((checkpoint) => {
          if (checkpoint.status === "applied") {
            return (
              <Surface key={checkpoint.id} tone="sunk" className="px-5 py-3.5">
                <p className="text-sm text-ink-soft">
                  Placed from this check-in {checkpoint.when}.
                </p>
              </Surface>
            );
          }

          const err =
            actionState.status === "error" && actionState.id === checkpoint.id
              ? actionState.message
              : undefined;
          const isApplying =
            pending && activeAction?.id === checkpoint.id && activeAction.kind === "apply";
          const isRedoing =
            pending && activeAction?.id === checkpoint.id && activeAction.kind === "redo";

          return (
            <Surface key={checkpoint.id} tone="raised" className="border border-line p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold text-ink">
                    {checkpoint.unitTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">Checked in {checkpoint.when}</p>
                </div>
                <Pill tone="accent" className="shrink-0">
                  {checkpoint.seed.length} to skip ahead
                </Pill>
              </div>

              <ul className="mt-4 flex flex-wrap gap-2">
                {checkpoint.verdicts.map((verdict) => (
                  <li key={verdict.skill}>
                    <Pill tone={BAND_TONE[verdict.band]}>
                      {getSkill(verdict.skill)?.label ?? verdict.skill}: {BAND_LABEL[verdict.band]}
                    </Pill>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="accent"
                  size="md"
                  onClick={() => callAction(checkpoint.id, "apply", applyPlacementAction)}
                  disabled={pending}
                  aria-label={`Apply check-in for ${checkpoint.unitTitle}`}
                >
                  <CheckCircleIcon weight="regular" className="size-4" />
                  {isApplying ? "Applying…" : "Apply — start her here"}
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  size="md"
                  onClick={() => callAction(checkpoint.id, "redo", redoCheckpointAction)}
                  disabled={pending}
                  aria-label={`Redo check-in for ${checkpoint.unitTitle}`}
                >
                  <ArrowCounterClockwiseIcon weight="regular" className="size-4" />
                  {isRedoing ? "Redoing…" : "Not now / Redo"}
                </Button>

                {err && <StatusMessage tone="error">{err}</StatusMessage>}
              </div>
            </Surface>
          );
        })}
      </div>
    </section>
  );
}
