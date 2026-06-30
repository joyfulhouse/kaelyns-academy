import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackLink } from "@/components/ui/BackLink";
import { AssignProgramControl } from "@/components/parent/AssignProgramControl";
import { getProgramDetail } from "@/app/(parent)/data";
import { getProgramAsync } from "@/lib/content/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // getProgramAsync is cache()-wrapped, so this shares its query with the page's
  // own getProgramDetail -> getProgramAsync call below (no extra DB round-trip).
  const program = await getProgramAsync(slug);
  return { title: program?.title ?? "Program" };
}

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const detail = await getProgramDetail(slug);

  if (!detail) notFound();

  const { summary, units, skills, stats, learners } = detail;

  // Group skills by domain for display.
  const skillsByDomain = skills.reduce<Record<string, string[]>>((acc, s) => {
    if (!acc[s.domain]) acc[s.domain] = [];
    acc[s.domain].push(s.label);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back nav */}
      <BackLink
        href="/parent/curriculum"
        label="Curriculum"
        variant="plain"
        icon={<CaretLeftIcon weight="bold" className="size-4" />}
      />

      {/* Program header */}
      <PageHeader className="mt-4" eyebrow="Program" title={summary.title} />
      {summary.subtitle && (
        <p className="mt-1 text-lg text-ink-soft">{summary.subtitle}</p>
      )}

      {/* Meta pills */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {summary.ageBand && <Pill tone="ready">{summary.ageBand}</Pill>}
        {summary.languages.map((lang) => (
          <Pill key={lang} tone="accent">{lang}</Pill>
        ))}
      </div>

      {/* Stats */}
      <p className="mt-3 text-sm text-ink-faint">
        {stats.units} {stats.units === 1 ? "unit" : "units"}
        {" · "}
        {stats.lessons} {stats.lessons === 1 ? "lesson" : "lessons"}
        {" · "}
        {stats.activities} {stats.activities === 1 ? "activity" : "activities"}
      </p>

      {summary.summary && (
        <p className="mt-4 max-w-prose text-ink-soft">{summary.summary}</p>
      )}

      {/* Units */}
      {units.length > 0 && (
        <section className="mt-10" aria-labelledby="units-heading">
          <h2 id="units-heading" className="font-display text-xl font-semibold tracking-tight">
            Units
          </h2>
          <ol className="mt-4 flex flex-col gap-2">
            {units.map((unit, i) => (
              <li
                key={unit.key}
                className="flex items-center gap-3 rounded-lg border border-line px-4 py-3"
              >
                <span className="shrink-0 font-mono text-sm text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {unit.emoji && (
                  <span aria-hidden className="shrink-0 text-lg">
                    {unit.emoji}
                  </span>
                )}
                <span className="font-display text-sm font-semibold text-ink">{unit.title}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Skills covered */}
      {skills.length > 0 && (
        <section className="mt-10" aria-labelledby="skills-heading">
          <h2 id="skills-heading" className="font-display text-xl font-semibold tracking-tight">
            Skills covered
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            {Object.entries(skillsByDomain).map(([domain, labels]) => (
              <div key={domain}>
                <p className="mb-2 text-sm font-semibold text-ink capitalize">{domain}</p>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => (
                    <Pill key={label} tone="neutral">{label}</Pill>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Assign to learners */}
      <section className="mt-10" aria-labelledby="assign-heading">
        <h2 id="assign-heading" className="font-display text-xl font-semibold tracking-tight">
          Assign to a learner
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Each learner can be assigned this program independently. Active assignments can be
          configured from their profile page.
        </p>

        <AssignProgramControl slug={slug} learners={learners} />
      </section>
    </div>
  );
}
