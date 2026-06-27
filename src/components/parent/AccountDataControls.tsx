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
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { deleteAccountAction, exportAccountAction } from "@/app/(parent)/actions";

/**
 * Account-level data controls (spec §8 COPPA: "export/delete … all its data").
 * Two cards: export-all (client Blob download, no server temp files; the account
 * bundle filename carries NO child name so it can't leak one via download/
 * history) and delete-account. The delete card extends the LearnerDataControls
 * two-click pattern with a real RE-AUTH gate: the parent must type their account
 * email AND password, both re-verified server-side (the password through Better
 * Auth) BEFORE anything is deleted — wrong/missing either refuses and deletes
 * nothing. On success the session is invalidated and we redirect to /goodbye.
 */

type ExportState = { status: "idle" } | { status: "error"; message: string };

type DeleteState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "error"; message: string };

export function AccountDataControls({ accountEmail }: { accountEmail: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [exportState, setExportState] = useState<ExportState>({ status: "idle" });

  // Delete card: its own pending flag + inputs (email + password re-auth).
  const [isDeleting, startDeleteTransition] = useTransition();
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: "idle" });
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");

  // The confirm button is live only once both fields are filled (defense against
  // a fat-finger empty submit; the server re-verifies both regardless).
  const canConfirmDelete = confirmEmail.trim().length > 0 && password.length > 0;

  function openDelete() {
    setDeleteState({ status: "confirming" });
    setExportState({ status: "idle" });
  }

  function cancelDelete() {
    setDeleteState({ status: "idle" });
    setConfirmEmail("");
    setPassword("");
  }

  function handleDeleteConfirm() {
    if (isDeleting || !canConfirmDelete) return;
    setDeleteState({ status: "confirming" });

    startDeleteTransition(async () => {
      try {
        const result = await deleteAccountAction({
          password,
          confirmToken: confirmEmail,
        });
        if (result.ok) {
          // Session is gone — leave the gated app for the public confirmation.
          router.push("/goodbye");
        } else {
          setDeleteState({
            status: "error",
            message:
              result.message ?? "Could not delete your account. Please try again.",
          });
        }
      } catch {
        setDeleteState({
          status: "error",
          message: "Could not delete your account. Please try again.",
        });
      }
    });
  }

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

        {/* Delete card — irreversible, re-auth gated */}
        <Surface tone="raised" className="border border-line p-5">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-display text-base font-semibold text-ink">Delete account</p>
              <p className="mt-1 text-sm text-ink-soft">
                Permanently delete your account and every learner&rsquo;s data. This cannot be
                undone.
              </p>
            </div>

            {deleteState.status !== "confirming" && deleteState.status !== "error" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={openDelete}>
                  <TrashIcon weight="regular" className="size-4" />
                  Delete account
                </Button>
              </div>
            )}

            {(deleteState.status === "confirming" || deleteState.status === "error") && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium text-danger">
                  This permanently deletes your account and all data. Confirm your email and
                  password to continue.
                </p>

                <Field
                  id="delete-confirm-email"
                  label="Your account email"
                  hint={accountEmail ? `Type ${accountEmail} to confirm.` : undefined}
                >
                  {(field) => (
                    <TextInput
                      {...field}
                      type="email"
                      autoComplete="username"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      placeholder={accountEmail ?? "you@example.com"}
                      disabled={isDeleting}
                    />
                  )}
                </Field>

                <Field id="delete-confirm-password" label="Your password">
                  {(field) => (
                    <TextInput
                      {...field}
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                      disabled={isDeleting}
                    />
                  )}
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={handleDeleteConfirm}
                    disabled={isDeleting || !canConfirmDelete}
                    className="border-danger/40 text-danger hover:border-danger/60"
                  >
                    <CheckCircleIcon weight="regular" className="size-4" />
                    {isDeleting ? "Deleting…" : "Permanently delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelDelete}
                    disabled={isDeleting}
                  >
                    <XCircleIcon weight="regular" className="size-4" />
                    Cancel
                  </Button>
                </div>

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
            )}
          </div>
        </Surface>
      </div>
    </section>
  );
}
