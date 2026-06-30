import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Surface } from "@/components/ui/Surface";
import { BackLink } from "@/components/ui/BackLink";
import { ProgramEditor } from "@/components/admin/editor/ProgramEditor";
import { listAdminPrograms, loadVersionForEdit } from "@/lib/content/store";
import { CloneToDraftButton } from "./CloneToDraftButton";

/**
 * Curriculum tree editor — RSC, gated by the admin layout.
 * Resolves the program's open DRAFT version (independent of program.status — a
 * clone of a published/archived program leaves the program record published but
 * creates a draft version). If a draft exists, it is edited; if none exists but
 * the program has versions, a "Clone to draft to edit" prompt is shown; if the
 * program has no versions at all, redirects back to the detail page.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit program" };

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const programs = await listAdminPrograms();
  const program = programs.find((p) => p.programId === id);

  if (!program) notFound();

  // Edit the open draft version, whatever the program's overall status is. If
  // there's no draft, show the clone prompt (a published/archived program must
  // be cloned to a draft before it can be edited).
  const versionToLoad = program.draftVersionId;

  if (!versionToLoad) {
    if (!program.latestVersionId) {
      // No versions at all — redirect to detail.
      redirect(`/admin/programs/${id}`);
    }
    // Has versions but no open draft (published or archived) — show clone prompt.
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
  return <BackLink href={`/admin/programs/${id}`} label="Program detail" variant="transition" />;
}
