"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { createInterestAction, updateInterestAction } from "@/app/(admin)/admin/motivation-actions";
import type { AdminInterestRow } from "@/lib/interests/admin-store";
import type { LifecycleStatus } from "@/lib/admin/lifecycle";

const STATUS_OPTIONS: { value: LifecycleStatus; label: string }[] = [
  { value: "draft", label: "Draft (not yet offered)" },
  { value: "published", label: "Published" },
];

/**
 * Create/edit form for one interest. New interests default to "draft" (T12
 * review requirement: the child picker and AI theming prompt consume
 * published-only, so authoring must be safe-by-default) — the status select
 * makes that choice explicit rather than relying on a silent default alone.
 */
export function InterestForm({ interest }: { interest?: AdminInterestRow }) {
  const router = useRouter();
  const isEdit = interest !== undefined;
  const slugId = useId();
  const labelId = useId();
  const iconId = useId();
  const statusId = useId();

  const [slug, setSlug] = useState(interest?.slug ?? "");
  const [label, setLabel] = useState(interest?.label ?? "");
  const [icon, setIcon] = useState(interest?.icon ?? "");
  const [status, setStatus] = useState<LifecycleStatus>("draft");

  const { run, pending, error, succeeded, reset, fail } = useAsyncAction();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (!isEdit && slug.trim().length === 0) {
      fail("Slug is required.");
      return;
    }
    if (label.trim().length === 0) {
      fail("Label is required.");
      return;
    }

    if (isEdit) {
      run(() => updateInterestAction(interest.id, { label: label.trim(), icon: icon.trim() || undefined }), {
        onSuccess: () => router.refresh(),
        fallbackMessage: "Could not save the interest. Please try again.",
      });
    } else {
      run(
        () =>
          createInterestAction({
            slug: slug.trim(),
            label: label.trim(),
            icon: icon.trim() || undefined,
            status,
          }),
        {
          onSuccess: () => {
            router.refresh();
            setSlug("");
            setLabel("");
            setIcon("");
            setStatus("draft");
          },
          fallbackMessage: "Could not create the interest. Please try again.",
        },
      );
    }
  }

  const errorMessage = error ?? undefined;

  function clearError() {
    if (error !== null || succeeded) reset();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field
          id={slugId}
          label="Slug"
          hint={isEdit ? "Can't be changed after creation." : undefined}
          className="sm:col-span-1"
          error={!isEdit && errorMessage?.startsWith("Slug") ? errorMessage : undefined}
        >
          {(field) => (
            <TextInput
              {...field}
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                clearError();
              }}
              placeholder="dinosaurs"
              autoComplete="off"
              maxLength={80}
              disabled={pending || isEdit}
              invalid={Boolean(!isEdit && errorMessage?.startsWith("Slug"))}
            />
          )}
        </Field>

        <Field
          id={labelId}
          label="Label"
          className="sm:col-span-1"
          error={errorMessage?.startsWith("Label") ? errorMessage : undefined}
        >
          {(field) => (
            <TextInput
              {...field}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                clearError();
              }}
              placeholder="Dinosaurs"
              autoComplete="off"
              maxLength={80}
              disabled={pending}
              invalid={Boolean(errorMessage?.startsWith("Label"))}
            />
          )}
        </Field>

        <Field id={iconId} label="Icon" optional hint="1 emoji." className="sm:col-span-1">
          {(field) => (
            <TextInput
              {...field}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🦕"
              autoComplete="off"
              maxLength={8}
              disabled={pending}
            />
          )}
        </Field>

        {!isEdit && (
          <Field id={statusId} label="Status" className="sm:col-span-1">
            {(field) => (
              <Select
                {...field}
                options={STATUS_OPTIONS}
                value={status}
                onChange={(e) => setStatus(e.target.value as LifecycleStatus)}
                disabled={pending}
              />
            )}
          </Field>
        )}
      </div>

      {errorMessage && !errorMessage.startsWith("Slug") && !errorMessage.startsWith("Label") && (
        <StatusMessage tone="error">{errorMessage}</StatusMessage>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="sm" disabled={pending}>
          {isEdit ? (
            <FloppyDiskIcon weight="bold" className="size-4" />
          ) : (
            <PlusIcon weight="bold" className="size-4" />
          )}
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create interest"}
        </Button>

        {succeeded && <StatusMessage tone="success">{isEdit ? "Saved." : "Interest created."}</StatusMessage>}
      </div>
    </form>
  );
}
