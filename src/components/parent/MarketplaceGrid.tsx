import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProgramCard } from "@/components/parent/ProgramCard";
import type { CatalogProgram } from "@/app/(parent)/data";

/**
 * Responsive grid of program catalog cards. Renders a calm empty state when
 * no programs are published yet.
 */
export function MarketplaceGrid({ programs }: { programs: CatalogProgram[] }) {
  if (programs.length === 0) {
    return (
      <EmptyState
        className="mt-8 p-12"
        icon={<BookOpenTextIcon weight="regular" className="size-10 text-ink-faint" />}
        title="No programs published yet"
        description="Check back soon — new programs will appear here when they are ready."
      />
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
