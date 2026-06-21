import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  PencilIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Pill } from "@/components/ui/Pill";
import { Surface } from "@/components/ui/Surface";
import { Button } from "@/components/ui/Button";
import { ProgramLifecycleControls } from "@/components/admin/ProgramLifecycleControls";
import { listAdminPrograms } from "@/lib/content/store";
import type { PillTone } from "@/components/ui/Pill";

/**
 * Program detail page — RSC, already gated by the admin layout.
 * Shows program metadata, lifecycle controls, and a placeholder editor entry
 * point (the full nested tree editor lands in Task 5.3).
 */
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, PillTone> = {
  draft: "ready",
  published: "success",
  archived: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const programs = await listAdminPrograms();
  const program = programs.find((p) => p.programId === id);

  if (!program) notFound();

  return (
    <div className="flex flex-col gap-8">
      {/* Back nav */}
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <ArrowLeftIcon weight="regular" className="size-4" />
        All programs
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
              {program.title}
            </h1>
            <Pill tone={STATUS_TONE[program.status] ?? "neutral"}>
              {STATUS_LABEL[program.status] ?? program.status}
            </Pill>
          </div>
          <p className="mt-1 text-sm text-ink-faint">/{program.slug}</p>
        </div>
      </div>

      {/* Version metadata */}
      <Surface tone="raised" className="border border-line p-6">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">
          Version info
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-ink-soft">Latest version</dt>
            <dd className="mt-0.5 text-sm text-ink">
              {program.latestVersion != null ? `v${program.latestVersion}` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-soft">Latest version ID</dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-ink-faint">
              {program.latestVersionId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-soft">Published version ID</dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-ink-faint">
              {program.publishedVersionId ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-ink-soft">Program ID</dt>
            <dd className="mt-0.5 truncate font-mono text-xs text-ink-faint">
              {program.programId}
            </dd>
          </div>
        </dl>
      </Surface>

      {/* Lifecycle controls */}
      <Surface tone="raised" className="border border-line p-6">
        <h2 className="mb-4 font-display text-sm font-semibold text-ink">
          Lifecycle actions
        </h2>
        <ProgramLifecycleControls
          programId={program.programId}
          status={program.status}
          latestVersionId={program.latestVersionId}
        />
      </Surface>

      {/* Editor entry point */}
      <Surface tone="raised" className="border border-line p-6">
        <h2 className="mb-2 font-display text-sm font-semibold text-ink">
          Content editor
        </h2>
        <p className="mb-4 text-sm text-ink-soft">
          Edit the program&rsquo;s unit, lesson, and activity tree. Only draft
          versions are editable — use &ldquo;Clone to draft&rdquo; if this
          program is published.
        </p>
        <Button
          href={`/admin/programs/${program.programId}/edit`}
          variant="soft"
          size="sm"
        >
          <PencilIcon weight="regular" className="size-4" />
          Edit content
        </Button>
      </Surface>
    </div>
  );
}
