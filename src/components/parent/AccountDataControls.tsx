"use client";

import { useState, useTransition } from "react";
import {
  DownloadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Surface } from "@/components/ui/Surface";
import { exportAccountAction } from "@/app/(parent)/actions";

/**
 * Account-level data controls (spec §8 COPPA: "export/delete … all its data").
 * P6.3 ships the export card; the delete-account card (re-auth + typed confirm)
 * lands beside it in P6.5. Mirrors the LearnerDataControls client pattern:
 * useTransition + a discriminated result + a client Blob download (no server
 * temp files). The account bundle filename carries NO child name (the bundle
 * spans every child) so it can't leak a name via the download/history.
 */

type ExportState = { status: "idle" } | { status: "error"; message: string };

export function AccountDataControls() {
  const [isPending, startTransition] = useTransition();
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  function handleExport() {
    if (isPending) return;
    setExportState({ status: "idle" });

    startTransition(async () => {
      try {
        const result = await exportAccountAction();
        if (result.ok) {
          // Trigger client-side download — no server temp file needed.
          const json = JSON.stringify(result.data, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = "kaelyns-academy-export.json";
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
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

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold tracking-tight">Privacy &amp; your data</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        We keep only a display name and birth month for each learner, plus your account email. No
        ads, no third-party tracking. Your child&rsquo;s data is yours.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {/* Export card */}
        <Surface tone="raised" className="border border-line p-5">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-display text-base font-semibold text-ink">Export all data</p>
              <p className="mt-1 text-sm text-ink-soft">
                Download one JSON file with your account, every learner, their settings,
                enrollments, skill progress, activity attempts, and what the AI made.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={handleExport}
                disabled={isPending}
              >
                <DownloadSimpleIcon weight="regular" className="size-4" />
                {isPending ? "Exporting…" : "Export JSON"}
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
      </div>
    </section>
  );
}
