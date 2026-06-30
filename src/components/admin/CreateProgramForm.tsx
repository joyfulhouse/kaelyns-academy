"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { createProgramDraftAction } from "@/app/(admin)/admin/actions";

/**
 * Create-program form. Uses useAsyncAction (transition + discriminated result)
 * and router.push on success. Validates "forbidden" and "invalid" (e.g. a
 * duplicate slug) results; field-specific guards surface in the relevant Field.
 */

const WORLD_OPTIONS = [
  { value: "", label: "— choose a world —" },
  { value: "sunshine", label: "Sunshine" },
  { value: "ocean", label: "Ocean" },
  { value: "space", label: "Space" },
  { value: "garden", label: "Garden" },
  { value: "bigtop", label: "Big Top" },
];

export function CreateProgramForm() {
  const router = useRouter();
  const slugId = useId();
  const titleId = useId();
  const subtitleId = useId();
  const ageBandId = useId();
  const summaryId = useId();
  const worldId = useId();
  const languagesId = useId();

  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [summary, setSummary] = useState("");
  const [world, setWorld] = useState("");
  const [languages, setLanguages] = useState("en");

  const { run, pending, error, succeeded, reset, fail } = useAsyncAction();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Client guard — server re-validates regardless. These field-specific
    // messages route to the matching Field by their "Slug"/"Title" prefix.
    if (slug.trim().length === 0) {
      fail("Slug is required.");
      return;
    }
    if (title.trim().length === 0) {
      fail("Title is required.");
      return;
    }

    const langArray = languages
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);

    run(
      () =>
        createProgramDraftAction({
          slug: slug.trim(),
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          ageBand: ageBand.trim() || undefined,
          summary: summary.trim() || undefined,
          world: world || undefined,
          languages: langArray.length > 0 ? langArray : undefined,
        }),
      {
        onSuccess: (result) => router.push(`/admin/programs/${result.programId}`),
        errorMessage: (result) =>
          result.reason === "forbidden"
            ? "Admins only. You do not have permission to create programs."
            : result.message,
        fallbackMessage: "Could not create the program. Please try again.",
      },
    );
  }

  const errorMessage = error ?? undefined;

  function clearError() {
    if (error !== null || succeeded) reset();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={slugId} label="Slug" error={errorMessage?.startsWith("Slug") ? errorMessage : undefined}>
          {(field) => (
            <TextInput
              {...field}
              value={slug}
              onChange={(e) => { setSlug(e.target.value); clearError(); }}
              placeholder="summer-bridge-k-to-1"
              autoComplete="off"
              maxLength={80}
              invalid={Boolean(errorMessage?.startsWith("Slug"))}
              disabled={pending}
            />
          )}
        </Field>

        <Field id={worldId} label="World" optional>
          {(field) => (
            <Select
              {...field}
              options={WORLD_OPTIONS}
              value={world}
              onChange={(e) => setWorld(e.target.value)}
              disabled={pending}
            />
          )}
        </Field>
      </div>

      <Field id={titleId} label="Title" error={errorMessage?.startsWith("Title") ? errorMessage : undefined}>
        {(field) => (
          <TextInput
            {...field}
            value={title}
            onChange={(e) => { setTitle(e.target.value); clearError(); }}
            placeholder="Summer Bridge: Kindergarten to Grade 1"
            autoComplete="off"
            maxLength={160}
            invalid={Boolean(errorMessage?.startsWith("Title"))}
            disabled={pending}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={subtitleId} label="Subtitle" optional>
          {(field) => (
            <TextInput
              {...field}
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="8-week summer readiness program"
              autoComplete="off"
              maxLength={240}
              disabled={pending}
            />
          )}
        </Field>

        <Field id={ageBandId} label="Age band" optional>
          {(field) => (
            <TextInput
              {...field}
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value)}
              placeholder="Ages 5–6"
              autoComplete="off"
              maxLength={40}
              disabled={pending}
            />
          )}
        </Field>
      </div>

      <Field id={summaryId} label="Summary" optional>
        {(field) => (
          <TextInput
            {...field}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="A short description shown in the catalog."
            autoComplete="off"
            maxLength={400}
            disabled={pending}
          />
        )}
      </Field>

      <Field
        id={languagesId}
        label="Languages"
        optional
        hint="Comma-separated locale codes, e.g. en, zh-TW"
      >
        {(field) => (
          <TextInput
            {...field}
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            placeholder="en"
            autoComplete="off"
            disabled={pending}
          />
        )}
      </Field>

      {/* General error (non-field-specific) */}
      {errorMessage && !errorMessage.startsWith("Slug") && !errorMessage.startsWith("Title") && (
        <StatusMessage tone="error">{errorMessage}</StatusMessage>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="md" disabled={pending}>
          <PlusIcon weight="bold" className="size-4" />
          {pending ? "Creating…" : "Create program"}
        </Button>

        {succeeded && (
          <StatusMessage tone="success">Program created. Redirecting…</StatusMessage>
        )}
      </div>
    </form>
  );
}
