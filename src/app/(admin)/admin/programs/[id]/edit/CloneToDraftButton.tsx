"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { cloneToDraftAction } from "@/app/(admin)/admin/actions";

/**
 * Calls `cloneToDraftAction` and redirects to the new draft's edit page on
 * success. Used from the "no draft" prompt in the edit page.
 */
export function CloneToDraftButton({ programId }: { programId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClone() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await cloneToDraftAction(programId);
        if (result.ok) {
          router.push(`/admin/programs/${programId}/edit`);
          router.refresh();
        } else {
          setError(result.message ?? "Clone failed.");
        }
      } catch {
        setError("Clone failed. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        variant="accent"
        size="md"
        onClick={handleClone}
        disabled={isPending}
      >
        <CopyIcon weight="regular" className="size-5" />
        {isPending ? "Cloning…" : "Clone to draft"}
      </Button>
      {error && (
        <p role="alert" className="inline-flex items-center gap-1 text-sm font-medium text-danger">
          <WarningCircleIcon weight="regular" className="size-4" />
          {error}
        </p>
      )}
    </div>
  );
}
