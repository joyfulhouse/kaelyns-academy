import type { Metadata } from "next";
import { Surface } from "@/components/ui/Surface";
import { StickerPackForm } from "@/components/admin/StickerPackForm";
import { StickerForm } from "@/components/admin/StickerForm";
import { LifecycleStatusControls } from "@/components/admin/LifecycleStatusControls";
import { LifecycleStatusPill } from "@/components/admin/LifecycleStatusPill";
import { InlineDisclosure } from "@/components/admin/InlineDisclosure";
import { listStickerPacks } from "@/lib/rewards/admin-store";
import { setStickerPackStatusAction } from "@/app/(admin)/admin/motivation-actions";

/**
 * Admin sticker pack list — RSC, already gated by the admin layout.
 * Calls the admin-store directly (the layout has already enforced admin).
 * Stickers are grouped by pack (Task 12 brief): each pack card shows its
 * emoji + star cost per sticker, plus an inline "add a sticker" form.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stickers" };

export default async function AdminStickersPage() {
  const packs = await listStickerPacks();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Stickers
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Sticker packs the star shop offers to every learner.
        </p>
      </div>

      <section aria-labelledby="create-pack-heading">
        <h2 id="create-pack-heading" className="mb-4 font-display text-base font-semibold text-ink">
          Create a pack
        </h2>
        <Surface tone="raised" className="p-6 border border-line">
          <StickerPackForm />
        </Surface>
      </section>

      <section aria-labelledby="pack-list-heading">
        <h2 id="pack-list-heading" className="mb-4 font-display text-base font-semibold text-ink">
          All packs
          {packs.length > 0 && <span className="ml-2 font-normal text-ink-soft">({packs.length})</span>}
        </h2>

        {packs.length === 0 ? (
          <p className="text-sm text-ink-soft">No sticker packs yet. Create one above.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {packs.map((pack) => (
              <Surface key={pack.id} tone="raised" className="p-5 border border-line">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold text-ink">{pack.title}</span>
                      <LifecycleStatusPill status={pack.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      /{pack.slug}
                      {pack.theme ? ` · ${pack.theme}` : ""}
                    </p>
                  </div>
                  <LifecycleStatusControls
                    id={pack.id}
                    status={pack.status}
                    action={setStickerPackStatusAction}
                  />
                </div>

                {pack.stickers.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {pack.stickers.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center gap-1.5 rounded-pill bg-paper-sunk px-3 py-1.5 text-sm"
                      >
                        <span aria-hidden="true" className="text-base">
                          {s.artRef.replace(/^emoji:/, "")}
                        </span>
                        <span className="font-medium text-ink">{s.title}</span>
                        <span className="text-ink-faint">· {s.starCost}⭐</span>
                      </li>
                    ))}
                  </ul>
                )}

                <InlineDisclosure label="Add a sticker to this pack">
                  <StickerForm packId={pack.id} />
                </InlineDisclosure>
              </Surface>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
