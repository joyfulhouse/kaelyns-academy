"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveBoxIcon,
  CheckCircleIcon,
  CopyIcon,
  RocketLaunchIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import {
  publishProgramAction,
  cloneToDraftAction,
  archiveProgramAction,
} from "@/app/(admin)/admin/actions";

/**
 * Lifecycle action buttons for a single program. Buttons gate on the open DRAFT
 * version (draftVersionId), not program.status — so a clone of a published or
 * archived program (which leaves program.status as-is) is still publishable:
 *
 *   has open draft         — Publish (publishes draftVersionId); no Clone (a
 *                            draft already exists); Archive (unless archived).
 *   published, no draft     — Clone to draft (makes an editable draft); Archive.
 *   archived, no draft      — Clone to draft (restore path); no Publish.
 *
 * Archive uses a two-click inline confirm — NO window.confirm.
 * All calls use useTransition + discriminated result + router.refresh().
 */

type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export function ProgramLifecycleControls({
  programId,
  status,
  draftVersionId,
}: {
  programId: string;
  status: string;
  draftVersionId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionState, setActionState] = useState<ActionState>({ status: "idle" });
  const [archiveConfirming, setArchiveConfirming] = useState(false);

  function handlePublish() {
    if (isPending || !draftVersionId) return;
    setArchiveConfirming(false);

    startTransition(async () => {
      try {
        const result = await publishProgramAction(draftVersionId);
        if (result.ok) {
          setActionState({ status: "success", message: "Program published." });
          router.refresh();
        } else {
          setActionState({
            status: "error",
            message: result.message ?? "Could not publish the program.",
          });
        }
      } catch {
        setActionState({
          status: "error",
          message: "Could not publish the program. Please try again.",
        });
      }
    });
  }

  function handleClone() {
    if (isPending) return;
    setArchiveConfirming(false);

    startTransition(async () => {
      try {
        const result = await cloneToDraftAction(programId);
        if (result.ok) {
          setActionState({ status: "success", message: "Draft created." });
          router.refresh();
        } else {
          setActionState({
            status: "error",
            message: result.message ?? "Could not create draft.",
          });
        }
      } catch {
        setActionState({
          status: "error",
          message: "Could not create draft. Please try again.",
        });
      }
    });
  }

  function handleArchiveConfirm() {
    if (isPending) return;
    setArchiveConfirming(false);

    startTransition(async () => {
      try {
        const result = await archiveProgramAction(programId);
        if (result.ok) {
          setActionState({ status: "success", message: "Program archived." });
          router.refresh();
        } else {
          setActionState({
            status: "error",
            message: result.message ?? "Could not archive the program.",
          });
        }
      } catch {
        setActionState({
          status: "error",
          message: "Could not archive the program. Please try again.",
        });
      }
    });
  }

  // Publish whenever there's an open draft (regardless of program.status — a
  // clone of a published/archived program is a publishable draft). Offer Clone
  // only when published/archived AND there is no open draft yet (else editing
  // the existing draft is the path). Archive is unchanged.
  const canPublish = draftVersionId !== null;
  const canClone = (status === "published" || status === "archived") && draftVersionId === null;
  const canArchive = status !== "archived";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {canPublish && (
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={handlePublish}
            disabled={isPending}
          >
            <RocketLaunchIcon weight="regular" className="size-4" />
            {isPending ? "Publishing…" : "Publish"}
          </Button>
        )}

        {canClone && (
          <Button
            type="button"
            variant="soft"
            size="sm"
            onClick={handleClone}
            disabled={isPending}
          >
            <CopyIcon weight="regular" className="size-4" />
            {isPending ? "Cloning…" : "Clone to draft"}
          </Button>
        )}

        {canArchive && !archiveConfirming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setArchiveConfirming(true); setActionState({ status: "idle" }); }}
            disabled={isPending}
          >
            <ArchiveBoxIcon weight="regular" className="size-4" />
            Archive
          </Button>
        )}

        {/* Two-click inline confirm — no window.confirm */}
        {canArchive && archiveConfirming && (
          <span className="inline-flex items-center gap-2">
            <span className="text-sm font-medium text-danger">Archive this program?</span>
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={handleArchiveConfirm}
              disabled={isPending}
            >
              <CheckCircleIcon weight="regular" className="size-4" />
              Confirm archive
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setArchiveConfirming(false)}
              disabled={isPending}
            >
              <XCircleIcon weight="regular" className="size-4" />
              Cancel
            </Button>
          </span>
        )}
      </div>

      {actionState.status === "success" && (
        <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
          <CheckCircleIcon weight="fill" className="size-4" />
          {actionState.message}
        </p>
      )}

      {actionState.status === "error" && (
        <p role="alert" className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
          <WarningCircleIcon weight="regular" className="size-4" />
          {actionState.message}
        </p>
      )}
    </div>
  );
}
