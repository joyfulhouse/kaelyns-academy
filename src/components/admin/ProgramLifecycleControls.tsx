"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveBoxIcon,
  CheckCircleIcon,
  CopyIcon,
  RocketLaunchIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
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
 * All three actions share one useAsyncAction; each sets its own success message
 * (the hook's `succeeded` flag gates the success badge).
 */
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
  const { run, pending, error, succeeded, reset } = useAsyncAction();
  const [successMessage, setSuccessMessage] = useState("");
  const [archiveConfirming, setArchiveConfirming] = useState(false);

  function handlePublish() {
    if (pending || !draftVersionId) return;
    setArchiveConfirming(false);

    run(() => publishProgramAction(draftVersionId), {
      onSuccess: () => {
        setSuccessMessage("Program published.");
        router.refresh();
      },
      fallbackMessage: "Could not publish the program. Please try again.",
    });
  }

  function handleClone() {
    if (pending) return;
    setArchiveConfirming(false);

    run(() => cloneToDraftAction(programId), {
      onSuccess: () => {
        setSuccessMessage("Draft created.");
        router.refresh();
      },
      fallbackMessage: "Could not create draft. Please try again.",
    });
  }

  function handleArchiveConfirm() {
    if (pending) return;
    setArchiveConfirming(false);

    run(() => archiveProgramAction(programId), {
      onSuccess: () => {
        setSuccessMessage("Program archived.");
        router.refresh();
      },
      fallbackMessage: "Could not archive the program. Please try again.",
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
            disabled={pending}
          >
            <RocketLaunchIcon weight="regular" className="size-4" />
            {pending ? "Publishing…" : "Publish"}
          </Button>
        )}

        {canClone && (
          <Button
            type="button"
            variant="soft"
            size="sm"
            onClick={handleClone}
            disabled={pending}
          >
            <CopyIcon weight="regular" className="size-4" />
            {pending ? "Cloning…" : "Clone to draft"}
          </Button>
        )}

        {canArchive && !archiveConfirming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setArchiveConfirming(true); reset(); }}
            disabled={pending}
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
              disabled={pending}
            >
              <CheckCircleIcon weight="regular" className="size-4" />
              Confirm archive
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setArchiveConfirming(false)}
              disabled={pending}
            >
              <XCircleIcon weight="regular" className="size-4" />
              Cancel
            </Button>
          </span>
        )}
      </div>

      {succeeded && <StatusMessage tone="success">{successMessage}</StatusMessage>}

      {error !== null && <StatusMessage tone="error">{error}</StatusMessage>}
    </div>
  );
}
