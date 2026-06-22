import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon } from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { CreateProgramForm } from "@/components/admin/CreateProgramForm";
import { listAdminPrograms } from "@/lib/content/store";
import { PROGRAM_STATUS_TONE, PROGRAM_STATUS_LABEL } from "@/lib/status-display";

/**
 * Admin program list — RSC, already gated by the admin layout.
 * Calls the store directly (the layout has already enforced admin).
 */
export const dynamic = "force-dynamic";

export default async function AdminProgramsPage() {
  const programs = await listAdminPrograms();

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Programs
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          All curriculum programs across every lifecycle status.
        </p>
      </div>

      {/* Create */}
      <section aria-labelledby="create-heading">
        <h2 id="create-heading" className="mb-4 font-display text-base font-semibold text-ink">
          Create a program
        </h2>
        <Surface tone="raised" className="p-6 border border-line">
          <CreateProgramForm />
        </Surface>
      </section>

      {/* Program list */}
      <section aria-labelledby="list-heading">
        <h2 id="list-heading" className="mb-4 font-display text-base font-semibold text-ink">
          All programs
          {programs.length > 0 && (
            <span className="ml-2 font-normal text-ink-soft">({programs.length})</span>
          )}
        </h2>

        {programs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-12 text-center">
            <BookOpenIcon weight="regular" className="size-8 text-ink-faint" />
            <p className="text-sm text-ink-soft">No programs yet. Create one above.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {programs.map((program) => (
              <Link
                key={program.programId}
                href={`/admin/programs/${program.programId}`}
                className="group flex items-center justify-between gap-4 rounded-xl border border-line bg-paper-raised px-5 py-4 transition-colors hover:border-line-strong hover:bg-paper"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold text-ink">
                      {program.title}
                    </span>
                    <Pill tone={PROGRAM_STATUS_TONE[program.status] ?? "neutral"}>
                      {PROGRAM_STATUS_LABEL[program.status] ?? program.status}
                    </Pill>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-faint">
                    /{program.slug}
                    {program.latestVersion != null && (
                      <span className="ml-2">v{program.latestVersion}</span>
                    )}
                  </p>
                </div>
                <ArrowRightIcon
                  weight="regular"
                  className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
