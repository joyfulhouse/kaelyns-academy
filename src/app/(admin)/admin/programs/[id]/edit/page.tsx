import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { Surface } from "@/components/ui/Surface";
import { ProgramEditor } from "@/components/admin/editor/ProgramEditor";
import { listAdminPrograms, loadVersionForEdit } from "@/lib/content/store";
import { CloneToDraftButton } from "./CloneToDraftButton";

/**
 * Curriculum tree editor — RSC, gated by the admin layout.
 * Resolves the program's latest draft version. If the program's latest version
 * is published (no draft), shows a "Clone to draft to edit" prompt.
 * If the program has no versions at all, redirects back to the detail page.
 */
export const dynamic = "force-dynamic";

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const programs = await listAdminPrograms();
  const program = programs.find((p) => p.programId === id);

  if (!program) notFound();

  // Determine which version to load. We want a draft; if none exists, show
  // the clone prompt.
  const isDraft = program.status === "draft";
  const versionToLoad = isDraft ? program.latestVersionId : null;

  if (!versionToLoad) {
    if (!program.latestVersionId) {
      // No versions at all — redirect to detail.
      redirect(`/admin/programs/${id}`);
    }
    // Has versions but no draft (published or archived) — show clone prompt.
    return (
      <div className="flex flex-col gap-8">
        <BackNav id={id} />
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {program.title}
        </h1>
        <Surface tone="sunk" className="flex flex-col gap-4 border border-dashed border-line p-8 text-center">
          <p className="text-sm font-semibold text-ink">
            This program is {program.status} — only draft versions are editable.
          </p>
          <p className="text-sm text-ink-soft">
            Clone the current version to a new draft to make changes.
          </p>
          <div className="flex justify-center">
            <CloneToDraftButton programId={id} />
          </div>
        </Surface>
      </div>
    );
  }

  const version = await loadVersionForEdit(versionToLoad);

  if (!version) {
    // Version disappeared between the list query and the load.
    redirect(`/admin/programs/${id}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <BackNav id={id} />

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          {version.metadata.title}
        </h1>
        <p className="mt-1 text-sm text-ink-faint">
          v{version.version} · draft · /{version.slug}
        </p>
      </div>

      <ProgramEditor version={version} />
    </div>
  );
}

function BackNav({ id }: { id: string }) {
  return (
    <Link
      href={`/admin/programs/${id}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
    >
      <ArrowLeftIcon weight="regular" className="size-4" />
      Program detail
    </Link>
  );
}
