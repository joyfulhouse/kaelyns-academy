import Link from "next/link";
import { ArrowRightIcon, RobotIcon, SparkleIcon } from "@phosphor-icons/react/dist/ssr";
import { Stars } from "@/components/ui/Stars";
import { Pill } from "@/components/ui/Pill";
import type { ProvenanceRow } from "@/app/(parent)/data";

/**
 * The "what the AI made" provenance trail (P6 / spec §8): a calm, read-only list
 * of a child's AI-GENERATED practice, one row per generated attempt, showing the
 * activity, the model/route that made it, when, and the child's star result.
 * Audit-honest: a row with no recorded model shows "model not recorded" rather
 * than fabricating one. Pagination is plain server-rendered links (no client
 * state, no new action) — `olderHref` points at the next keyset page.
 *
 * A pure presentational component (server-renderable): no child PII in any
 * title/metadata surface — the child's name lives only in the page header.
 */
export function AiProvenanceList({
  rows,
  olderHref,
  learnerName,
}: {
  rows: ProvenanceRow[];
  olderHref: string | null;
  learnerName: string;
}) {
  if (rows.length === 0) {
    return (
      <section className="mt-8 grid place-items-center rounded-xl border border-dashed border-line-strong p-12 text-center">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-md border border-line bg-accent/12 text-accent-deep"
        >
          <SparkleIcon weight="regular" className="size-6" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold">Nothing made yet</p>
        <p className="mt-1 max-w-md text-ink-soft">
          When {learnerName} taps &ldquo;more, made just for me,&rdquo; each AI-made practice item
          shows up here with what made it and when.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <ul className="overflow-hidden rounded-xl border border-line">
        {rows.map((row, i) => (
          <li
            key={`${row.activityId}-${i}`}
            className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-paper-sunk/70 text-accent-deep"
            >
              <RobotIcon weight="regular" className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{row.title}</p>
              <p className="text-sm text-ink-faint">
                {row.kindLabel}
                {row.madeOn ? ` · made ${row.madeOn}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Pill tone="neutral" className="hidden sm:inline-flex">
                {row.model ?? "model not recorded"}
              </Pill>
              <Stars value={row.stars} size="sm" />
            </div>
          </li>
        ))}
      </ul>

      {olderHref && (
        <div className="mt-4">
          <Link
            href={olderHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
          >
            View older
            <ArrowRightIcon weight="bold" className="size-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
