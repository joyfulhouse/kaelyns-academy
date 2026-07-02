"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { setOfferedInterestsAction } from "@/app/(parent)/actions";
import type { InterestView } from "@/lib/interests/store";

/**
 * Parent-gated Interests card (Task 9 / spec §4.3): every published interest as
 * a toggle, checked = currently OFFERED to the child. The child then picks up
 * to 5 of the offered set from their own picker (`/learn/interests`) — this
 * card only controls the menu, never the child's picks directly. Saves via
 * `setOfferedInterestsAction`, which also server-side prunes any child pick
 * that falls outside a newly-narrowed offered set (§8 subset invariant).
 *
 * Same `useAsyncAction` + `StatusMessage` plumbing as the neighboring forms on
 * this page: `EnrollmentConfigForm`'s "Active units" section (a per-item
 * `Switch` list) and `SettingsForm` (the Save row).
 */
export function InterestsCard({
  learnerId,
  allInterests,
  offeredIds,
}: {
  learnerId: string;
  allInterests: InterestView[];
  offeredIds: string[];
}) {
  const [offered, setOffered] = useState<Set<string>>(() => new Set(offeredIds));
  const { run, pending, error, succeeded, reset } = useAsyncAction();

  function toggle(id: string, checked: boolean) {
    setOffered((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
    reset();
  }

  function handleSave() {
    if (pending) return;
    run(() => setOfferedInterestsAction(learnerId, [...offered]), {
      fallbackMessage: "Could not save interests. Please try again.",
    });
  }

  return (
    <section>
      <h2 className="font-display text-xl font-semibold tracking-tight">Interests</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        Kaelyn can pick up to 5 of the interests you enable. Her picks theme her AI practice
        stories.
      </p>

      {allInterests.length === 0 ? (
        <p className="mt-5 text-sm text-ink-faint">No interests are published yet.</p>
      ) : (
        <div className="mt-5 flex flex-col divide-y divide-line rounded-xl border border-line">
          {allInterests.map((i) => (
            <div key={i.id} className="flex items-start gap-3 p-5">
              {i.icon && (
                <span aria-hidden className="mt-0.5 shrink-0 text-xl">
                  {i.icon}
                </span>
              )}
              <Switch
                checked={offered.has(i.id)}
                onChange={(v) => toggle(i.id, v)}
                label={i.label}
                disabled={pending}
                className="flex-1"
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          disabled={pending || allInterests.length === 0}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>

        {succeeded && <StatusMessage tone="success">Interests saved.</StatusMessage>}

        {error !== null && <StatusMessage tone="error">{error}</StatusMessage>}
      </div>
    </section>
  );
}
