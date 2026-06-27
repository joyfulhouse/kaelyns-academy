"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  DownloadSimpleIcon,
  TrashIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
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
 * Follows the AddChildForm / ProgramLifecycleControls client pattern:
 * useTransition + call in startTransition(async () => …) + discriminated result.
 */

type ExportState =
  | { status: "idle" }
  | { status: "error"; message: string };

type DeleteState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "error"; message: string };

export function LearnerDataControls({
  learnerId,
  learnerName,
}: {
  learnerId: string;
  learnerName: string;
}) {
  const router = useRouter();
  const [isPendingExport, startExportTransition] = useTransition();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: "idle" });

  function handleExport() {
    if (isPendingExport) return;
    setExportState({ status: "idle" });

    startExportTransition(async () => {
      try {
        const result = await exportLearnerAction(learnerId);
        if (result.ok) {
          downloadJson(result.data, `${learnerName}-export.json`);
        } else {
          setExportState({
            status: "error",
            message: result.message ?? "Could not export data. Please try again.",
          });
        }
      } catch {
        setExportState({
          status: "error",
          message: "Could not export data. Please try again.",
        });
      }
    });
  }

  function handleDeleteRequest() {
    setDeleteState({ status: "confirming" });
    setExportState({ status: "idle" });
  }

  function handleDeleteCancel() {
    setDeleteState({ status: "idle" });
  }

  function handleDeleteConfirm() {
    if (isPendingDelete) return;
    setDeleteState({ status: "idle" });

    startDeleteTransition(async () => {
      try {
        const result = await deleteLearnerAction(learnerId);
        if (result.ok) {
          router.push("/parent/learners");
        } else {
          setDeleteState({
            status: "error",
            message: result.message ?? "Could not delete the profile. Please try again.",
          });
        }
      } catch {
        setDeleteState({
          status: "error",
          message: "Could not delete the profile. Please try again.",
        });
      }
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
                disabled={isPendingExport}
              >
                <DownloadSimpleIcon weight="regular" className="size-4" />
                {isPendingExport ? "Exporting…" : "Export JSON"}
              </Button>
            </div>

            {exportState.status === "error" && (
              <p
                role="alert"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"
              >
                <WarningCircleIcon weight="regular" className="size-4" />
                {exportState.message}
              </p>
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

            {deleteState.status !== "confirming" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteRequest}
                  disabled={isPendingDelete}
                >
                  <TrashIcon weight="regular" className="size-4" />
                  Delete {learnerName}&rsquo;s profile
                </Button>
              </div>
            )}

            {/* Two-click inline confirm — no window.confirm */}
            {deleteState.status === "confirming" && (
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
                    disabled={isPendingDelete}
                    className="border-danger/40 text-danger hover:border-danger/60"
                  >
                    <CheckCircleIcon weight="regular" className="size-4" />
                    {isPendingDelete ? "Deleting…" : "Confirm delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteCancel}
                    disabled={isPendingDelete}
                  >
                    <XCircleIcon weight="regular" className="size-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {deleteState.status === "error" && (
              <p
                role="alert"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-danger"
              >
                <WarningCircleIcon weight="regular" className="size-4" />
                {deleteState.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
