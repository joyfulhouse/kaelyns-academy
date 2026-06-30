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
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { deleteAccountAction, exportAccountAction } from "@/app/(parent)/actions";
import { downloadJson } from "@/components/parent/downloadJson";

/**
 * Account-level data controls (spec §8 COPPA: "export/delete … all its data").
 * Two cards: export-all (client Blob download, no server temp files; the account
 * bundle filename carries NO child name so it can't leak one via download/
 * history) and delete-account. The delete card extends the LearnerDataControls
 * two-click pattern with a real RE-AUTH gate: the parent must type their account
 * email AND password, both re-verified server-side (the password through Better
 * Auth) BEFORE anything is deleted — wrong/missing either refuses and deletes
 * nothing. On success the session is invalidated and we redirect to /goodbye.
 *
 * Export and delete each get their own useAsyncAction (independent pending +
 * error); a local `confirming` flag tracks whether the re-auth form is open.
 */
export function AccountDataControls({ accountEmail }: { accountEmail: string | null }) {
  const router = useRouter();
  const exportAction = useAsyncAction();

  // Delete card: its own async action + the re-auth inputs (email + password).
  const deleteAction = useAsyncAction();
  const [confirming, setConfirming] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");

  // The confirm button is live only once both fields are filled (defense against
  // a fat-finger empty submit; the server re-verifies both regardless).
  const canConfirmDelete = confirmEmail.trim().length > 0 && password.length > 0;

  function openDelete() {
    setConfirming(true);
    exportAction.reset();
  }

  function cancelDelete() {
    setConfirming(false);
    setConfirmEmail("");
    setPassword("");
    deleteAction.reset();
  }

  function handleDeleteConfirm() {
    if (deleteAction.pending || !canConfirmDelete) return;

    deleteAction.run(
      () => deleteAccountAction({ password, confirmToken: confirmEmail }),
      {
        // Session is gone — leave the gated app for the public confirmation.
        onSuccess: () => router.push("/goodbye"),
        fallbackMessage: "Could not delete your account. Please try again.",
      },
    );
  }

  function handleExport() {
    if (exportAction.pending) return;

    exportAction.run(() => exportAccountAction(), {
      // The account bundle filename carries NO child name so it can't leak one
      // via the download / browser history (spec §8).
      onSuccess: (result) => downloadJson(result.data, "kaelyns-academy-export.json"),
      fallbackMessage: "Could not export data. Please try again.",
    });
  }

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold tracking-tight">Privacy &amp; your data</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        We keep only a display name and birth month for each learner, plus your account email. No
        ads, no third-party tracking. Your child&rsquo;s data is yours.
      </p>

      <div className="mt-5 grid items-start gap-4 sm:grid-cols-2">
        {/* Export card — the calm action: a normal raised card. */}
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

        {/* Delete card — irreversible, re-auth gated. Set apart at rest with a
            full danger-tinted border (never a side-stripe) so the eye registers
            gravity before the click; not a raised peer of the calm export card.
            Sitting on plain paper (not paper-raised) also keeps the danger
            warning/error copy at AA contrast (danger-on-raised is ~4.4:1). */}
        <div className="rounded-xl border border-danger/30 bg-paper p-5">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-display text-base font-semibold text-ink">Delete account</p>
              <p className="mt-1 text-sm text-ink-soft">
                Permanently delete your account and every learner&rsquo;s data. This cannot be
                undone.
              </p>
            </div>

            {!confirming && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={openDelete}>
                  <TrashIcon weight="regular" className="size-4" />
                  Delete account
                </Button>
              </div>
            )}

            {confirming && (
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
                      disabled={deleteAction.pending}
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
                      disabled={deleteAction.pending}
                    />
                  )}
                </Field>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={handleDeleteConfirm}
                    disabled={deleteAction.pending || !canConfirmDelete}
                    className="border-danger/40 text-danger hover:border-danger/60"
                  >
                    <CheckCircleIcon weight="regular" className="size-4" />
                    {deleteAction.pending ? "Deleting…" : "Permanently delete"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={cancelDelete}
                    disabled={deleteAction.pending}
                  >
                    <XCircleIcon weight="regular" className="size-4" />
                    Cancel
                  </Button>
                </div>

                {deleteAction.error !== null && (
                  <StatusMessage tone="error">{deleteAction.error}</StatusMessage>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
