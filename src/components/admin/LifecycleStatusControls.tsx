"use client";

import { useRouter } from "next/navigation";
import { ArchiveBoxIcon, RocketLaunchIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import type { LifecycleStatus } from "@/lib/admin/lifecycle";
import type { AdminErrorResult } from "@/lib/admin/action-helpers";

type StatusAction = (id: string, status: LifecycleStatus) => Promise<{ ok: true } | AdminErrorResult>;

/**
 * One draft→published→archived control, driven by a single lifecycle action
 * passed in by the caller — shared identically across the stickers/quests/
 * interests admin pages (Task 12). Transitions mirror
 * `isValidStatusTransition` (src/lib/admin/lifecycle.ts): draft→published,
 * published→archived, archived→published. Unlike program archiving (which
 * un-publishes a program and its enrolled learners' pinned version), moving a
 * row here is low-stakes and reversible, so there is no two-click confirm.
 */
export function LifecycleStatusControls({
  id,
  status,
  action,
}: {
  id: string;
  status: string;
  action: StatusAction;
}) {
  const router = useRouter();
  const { run, pending, error } = useAsyncAction();

  function moveTo(next: LifecycleStatus) {
    if (pending) return;
    run(() => action(id, next), {
      onSuccess: () => router.refresh(),
      fallbackMessage: "Could not update status. Please try again.",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <Button type="button" variant="soft" size="sm" onClick={() => moveTo("published")} disabled={pending}>
          <RocketLaunchIcon weight="regular" className="size-4" />
          {pending ? "Publishing…" : "Publish"}
        </Button>
      )}
      {status === "published" && (
        <Button type="button" variant="ghost" size="sm" onClick={() => moveTo("archived")} disabled={pending}>
          <ArchiveBoxIcon weight="regular" className="size-4" />
          {pending ? "Archiving…" : "Archive"}
        </Button>
      )}
      {status === "archived" && (
        <Button type="button" variant="soft" size="sm" onClick={() => moveTo("published")} disabled={pending}>
          <RocketLaunchIcon weight="regular" className="size-4" />
          {pending ? "Publishing…" : "Republish"}
        </Button>
      )}
      {error !== null && (
        <StatusMessage tone="error" className="ml-1">
          {error}
        </StatusMessage>
      )}
    </div>
  );
}
