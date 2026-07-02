import { Pill } from "@/components/ui/Pill";
import { LIFECYCLE_STATUS_LABEL, LIFECYCLE_STATUS_TONE } from "@/lib/status-display";
import type { LifecycleStatus } from "@/lib/admin/lifecycle";

/**
 * The status pill shared identically across the stickers/quests/interests
 * admin lists (Task 12). The `?? "neutral"` / `?? status` fallbacks keep the
 * pill rendering even if a row's stored status ever falls outside the
 * lifecycle enum, rather than throwing.
 */
export function LifecycleStatusPill({ status }: { status: string }) {
  const key = status as LifecycleStatus;
  return (
    <Pill tone={LIFECYCLE_STATUS_TONE[key] ?? "neutral"}>
      {LIFECYCLE_STATUS_LABEL[key] ?? status}
    </Pill>
  );
}
