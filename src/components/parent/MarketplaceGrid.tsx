import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import { ProgramCard } from "@/components/parent/ProgramCard";
import type { CatalogProgram } from "@/app/(parent)/data";

/**
 * Responsive grid of program catalog cards. Renders a calm empty state when
 * no programs are published yet.
 */
export function MarketplaceGrid({ programs }: { programs: CatalogProgram[] }) {
  if (programs.length === 0) {
    return (
      <div className="mt-8 grid place-items-center rounded-xl border border-dashed border-line-strong p-12 text-center">
        <BookOpenTextIcon weight="regular" className="size-10 text-ink-faint" />
        <p className="mt-3 font-display text-lg font-semibold">No programs published yet</p>
        <p className="mt-1 max-w-sm text-ink-soft">
          Check back soon — new programs will appear here when they are ready.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => (
        <li key={program.slug}>
          <ProgramCard program={program} />
        </li>
      ))}
    </ul>
  );
}
