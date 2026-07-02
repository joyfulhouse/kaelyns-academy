import type { Metadata } from "next";
import { Surface } from "@/components/ui/Surface";
import { Pill } from "@/components/ui/Pill";
import { QuestTemplateForm } from "@/components/admin/QuestTemplateForm";
import { LifecycleStatusControls } from "@/components/admin/LifecycleStatusControls";
import { LifecycleStatusPill } from "@/components/admin/LifecycleStatusPill";
import { InlineDisclosure } from "@/components/admin/InlineDisclosure";
import { listQuestTemplates } from "@/lib/quests/admin-store";
import { setQuestTemplateStatusAction } from "@/app/(admin)/admin/motivation-actions";

/**
 * Admin quest template list — RSC, already gated by the admin layout.
 * Calls the admin-store directly (the layout has already enforced admin).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quests" };

export default async function AdminQuestsPage() {
  const templates = await listQuestTemplates();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Quests
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Daily quest templates offered to every learner.
        </p>
      </div>

      <section aria-labelledby="create-quest-heading">
        <h2 id="create-quest-heading" className="mb-4 font-display text-base font-semibold text-ink">
          Create a quest template
        </h2>
        <Surface tone="raised" className="p-6 border border-line">
          <QuestTemplateForm />
        </Surface>
      </section>

      <section aria-labelledby="quest-list-heading">
        <h2 id="quest-list-heading" className="mb-4 font-display text-base font-semibold text-ink">
          All templates
          {templates.length > 0 && (
            <span className="ml-2 font-normal text-ink-soft">({templates.length})</span>
          )}
        </h2>

        {templates.length === 0 ? (
          <p className="text-sm text-ink-soft">No quest templates yet. Create one above.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {templates.map((t) => (
              <Surface key={t.id} tone="raised" className="p-5 border border-line">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold text-ink">{t.title}</span>
                      <LifecycleStatusPill status={t.status} />
                      <Pill tone="neutral">{t.kind}</Pill>
                      <Pill tone="accent">+{t.rewardStars}⭐</Pill>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">/{t.slug}</p>
                  </div>
                  <LifecycleStatusControls id={t.id} status={t.status} action={setQuestTemplateStatusAction} />
                </div>

                <InlineDisclosure label="Edit">
                  <QuestTemplateForm template={t} />
                </InlineDisclosure>
              </Surface>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
