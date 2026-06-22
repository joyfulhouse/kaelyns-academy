"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  PlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { createProgramDraftAction } from "@/app/(admin)/admin/actions";

/**
 * Create-program form. Follows the AddChildForm pattern: useTransition +
 * startTransition(async) + router.push on success. Validates discriminated
 * action results including "forbidden" and "invalid" (e.g. duplicate slug).
 */

const WORLD_OPTIONS = [
  { value: "", label: "— choose a world —" },
  { value: "sunshine", label: "Sunshine" },
  { value: "ocean", label: "Ocean" },
  { value: "space", label: "Space" },
  { value: "garden", label: "Garden" },
  { value: "bigtop", label: "Big Top" },
];

type FormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

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

  const [state, setState] = useState<FormState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    // Client guard — server re-validates regardless.
    if (slug.trim().length === 0) {
      setState({ status: "error", message: "Slug is required." });
      return;
    }
    if (title.trim().length === 0) {
      setState({ status: "error", message: "Title is required." });
      return;
    }

    startTransition(async () => {
      try {
        const langArray = languages
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean);

        const result = await createProgramDraftAction({
          slug: slug.trim(),
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          ageBand: ageBand.trim() || undefined,
          summary: summary.trim() || undefined,
          world: world || undefined,
          languages: langArray.length > 0 ? langArray : undefined,
        });

        if (result.ok) {
          setState({ status: "success" });
          router.push(`/admin/programs/${result.programId}`);
        } else {
          const message =
            result.reason === "forbidden"
              ? "Admins only. You do not have permission to create programs."
              : result.message;
          setState({ status: "error", message });
        }
      } catch {
        setState({
          status: "error",
          message: "Could not create the program. Please try again.",
        });
      }
    });
  }

  const errorMessage = state.status === "error" ? state.message : undefined;

  function clearError() {
    if (state.status !== "idle") setState({ status: "idle" });
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
              disabled={isPending}
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
              disabled={isPending}
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
            disabled={isPending}
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
              disabled={isPending}
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
              disabled={isPending}
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
            disabled={isPending}
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
            disabled={isPending}
          />
        )}
      </Field>

      {/* General error (non-field-specific) */}
      {errorMessage && !errorMessage.startsWith("Slug") && !errorMessage.startsWith("Title") && (
        <p role="alert" className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
          <WarningCircleIcon weight="regular" className="size-4" />
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="md" disabled={isPending}>
          <PlusIcon weight="bold" className="size-4" />
          {isPending ? "Creating…" : "Create program"}
        </Button>

        {state.status === "success" && (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircleIcon weight="fill" className="size-4" />
            Program created. Redirecting…
          </span>
        )}
      </div>
    </form>
  );
}
