"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  TrashIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { exportLearnerAction, deleteLearnerAction } from "@/app/(parent)/actions";
import { downloadJson } from "@/components/parent/downloadJson";

/**
 * Per-child data export + profile delete controls (spec §8 COPPA controls).
 *
 * Two cards:
 *   1. Export — triggers exportLearnerAction → client Blob download, no server
 *      temp files. Download is named `{learnerName}-export.json`.
 *   2. Delete — inline two-click confirm (no window.confirm). Confirm →
 *      deleteLearnerAction → on success router.push("/parent/learners").
 *
 * Export and delete each get their own useAsyncAction (independent pending +
 * error); a local `confirming` flag drives the two-click confirm UI.
 */
export function LearnerDataControls({
  learnerId,
  learnerName,
}: {
  learnerId: string;
  learnerName: string;
}) {
  const router = useRouter();
  const exportAction = useAsyncAction();
  const deleteAction = useAsyncAction();
  const [confirming, setConfirming] = useState(false);

  function handleExport() {
    if (exportAction.pending) return;

    exportAction.run(() => exportLearnerAction(learnerId), {
      onSuccess: (result) => downloadJson(result.data, `${learnerName}-export.json`),
      fallbackMessage: "Could not export data. Please try again.",
    });
  }

  function handleDeleteRequest() {
    setConfirming(true);
    exportAction.reset();
    deleteAction.reset();
  }

  function handleDeleteCancel() {
    setConfirming(false);
    deleteAction.reset();
  }

  function handleDeleteConfirm() {
    if (deleteAction.pending) return;
    // Close the confirm UI immediately; the trigger button (disabled) shows the
    // in-flight state, and any error surfaces below it.
    setConfirming(false);

    deleteAction.run(() => deleteLearnerAction(learnerId), {
      onSuccess: () => router.push("/parent/learners"),
      fallbackMessage: "Could not delete the profile. Please try again.",
    });
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold tracking-tight">Data &amp; privacy</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Export or permanently delete {learnerName}&rsquo;s learning data.
      </p>

      <div className="mt-5 grid items-start gap-4 sm:grid-cols-2">
        {/* Export card */}
        <Surface tone="raised" className="border border-line p-5">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-display text-base font-semibold text-ink">Export data</p>
              <p className="mt-1 text-sm text-ink-soft">
                Download a JSON file containing {learnerName}&rsquo;s profile, settings,
                enrollments, skill progress, and activity attempts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={handleExport}
                disabled={exportAction.pending}
              >
                <DownloadSimpleIcon weight="regular" className="size-4" />
                {exportAction.pending ? "Exporting…" : "Export JSON"}
              </Button>
            </div>

            {exportAction.error !== null && (
              <StatusMessage tone="error">{exportAction.error}</StatusMessage>
            )}
          </div>
        </Surface>

        {/* Delete card — set apart at rest with a full danger-tinted border (never
            a side-stripe) so the eye registers gravity before the click; on plain
            paper (not paper-raised) so the danger warning/confirm copy stays at AA
            contrast (danger-on-raised is ~4.4:1). Mirrors AccountDataControls. */}
        <div className="rounded-xl border border-danger/30 bg-paper p-5">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-display text-base font-semibold text-ink">Delete profile</p>
              <p className="mt-1 text-sm text-ink-soft">
                Permanently delete {learnerName}&rsquo;s profile and all their learning data.
                This cannot be undone.
              </p>
            </div>

            {!confirming && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteRequest}
                  disabled={deleteAction.pending}
                >
                  <TrashIcon weight="regular" className="size-4" />
                  Delete {learnerName}&rsquo;s profile
                </Button>
              </div>
            )}

            {/* Two-click inline confirm — no window.confirm */}
            {confirming && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-danger">
                  Delete {learnerName}&rsquo;s profile and all their data? This can&rsquo;t be
                  undone.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={handleDeleteConfirm}
                    disabled={deleteAction.pending}
                    className="border-danger/40 text-danger hover:border-danger/60"
                  >
                    <CheckCircleIcon weight="regular" className="size-4" />
                    {deleteAction.pending ? "Deleting…" : "Confirm delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteCancel}
                    disabled={deleteAction.pending}
                  >
                    <XCircleIcon weight="regular" className="size-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {deleteAction.error !== null && (
              <StatusMessage tone="error">{deleteAction.error}</StatusMessage>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
