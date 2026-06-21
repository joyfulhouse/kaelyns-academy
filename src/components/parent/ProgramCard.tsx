import Link from "next/link";
import { BookOpenTextIcon } from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import type { CatalogProgram } from "@/app/(parent)/data";

/**
 * A catalog card for one published program. Links to the program-detail page.
 * Displays title, subtitle, age band, language pills, and computed stats.
 */
export function ProgramCard({ program }: { program: CatalogProgram }) {
  const { slug, title, subtitle, ageBand, languages, stats } = program;

  return (
    <Link
      href={`/parent/curriculum/${slug}`}
      className="group block rounded-xl border border-line transition-colors hover:border-line-strong hover:bg-paper-sunk/40"
    >
      <Surface tone="raised" className="flex h-full flex-col gap-4 border border-line p-5">
        {/* Icon + title */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
          >
            <BookOpenTextIcon weight="regular" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold text-ink leading-snug">
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 text-sm text-ink-soft line-clamp-2">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Age band + languages */}
        <div className="flex flex-wrap items-center gap-1.5">
          {ageBand && (
            <Pill tone="ready">{ageBand}</Pill>
          )}
          {languages.map((lang) => (
            <Pill key={lang} tone="accent">{lang}</Pill>
          ))}
        </div>

        {/* Stats row */}
        <p className="mt-auto text-sm text-ink-faint">
          {stats.units} {stats.units === 1 ? "unit" : "units"}
          {" · "}
          {stats.lessons} {stats.lessons === 1 ? "lesson" : "lessons"}
          {" · "}
          {stats.activities} {stats.activities === 1 ? "activity" : "activities"}
        </p>
      </Surface>
    </Link>
  );
}
