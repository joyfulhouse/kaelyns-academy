import type { Metadata } from "next";
import { Surface } from "@/components/ui/Surface";
import { InterestForm } from "@/components/admin/InterestForm";
import { LifecycleStatusControls } from "@/components/admin/LifecycleStatusControls";
import { LifecycleStatusPill } from "@/components/admin/LifecycleStatusPill";
import { InlineDisclosure } from "@/components/admin/InlineDisclosure";
import { listInterests } from "@/lib/interests/admin-store";
import { setInterestStatusAction } from "@/app/(admin)/admin/motivation-actions";

/**
 * Admin interest taxonomy list — RSC, already gated by the admin layout.
 * Calls the admin-store directly (the layout has already enforced admin).
 * New interests default to draft (§8: only published rows reach the child
 * picker or the AI theming prompt).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Interests" };

export default async function AdminInterestsPage() {
  const interests = await listInterests();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Interests
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          The bounded taxonomy parents offer and children pick from — the only interest text AI practice ever sees.
        </p>
      </div>

      <section aria-labelledby="create-interest-heading">
        <h2 id="create-interest-heading" className="mb-4 font-display text-base font-semibold text-ink">
          Create an interest
        </h2>
        <Surface tone="raised" className="p-6 border border-line">
          <InterestForm />
        </Surface>
      </section>

      <section aria-labelledby="interest-list-heading">
        <h2 id="interest-list-heading" className="mb-4 font-display text-base font-semibold text-ink">
          All interests
          {interests.length > 0 && (
            <span className="ml-2 font-normal text-ink-soft">({interests.length})</span>
          )}
        </h2>

        {interests.length === 0 ? (
          <p className="text-sm text-ink-soft">No interests yet. Create one above.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {interests.map((i) => (
              <Surface key={i.id} tone="raised" className="p-4 border border-line">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {i.icon && (
                      <span aria-hidden="true" className="text-lg">
                        {i.icon}
                      </span>
                    )}
                    <span className="font-medium text-ink">{i.label}</span>
                    <LifecycleStatusPill status={i.status} />
                    <span className="truncate text-xs text-ink-faint">/{i.slug}</span>
                  </div>
                  <LifecycleStatusControls id={i.id} status={i.status} action={setInterestStatusAction} />
                </div>

                <InlineDisclosure label="Edit">
                  <InterestForm interest={i} />
                </InlineDisclosure>
              </Surface>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
