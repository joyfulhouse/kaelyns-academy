"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { createStickerPackAction, updateStickerPackAction } from "@/app/(admin)/admin/motivation-actions";
import type { AdminStickerPackRow } from "@/lib/rewards/admin-store";

/** Create/edit form for a sticker pack (Task 12). Individual stickers are
 *  authored per-pack via StickerForm, shown alongside this on the page. */
export function StickerPackForm({ pack }: { pack?: AdminStickerPackRow }) {
  const router = useRouter();
  const isEdit = pack !== undefined;
  const slugId = useId();
  const titleId = useId();
  const themeId = useId();
  const sortId = useId();

  const [slug, setSlug] = useState(pack?.slug ?? "");
  const [title, setTitle] = useState(pack?.title ?? "");
  const [theme, setTheme] = useState(pack?.theme ?? "");
  const [sortKey, setSortKey] = useState(pack?.sortKey ?? "");

  const { run, pending, error, succeeded, reset, fail } = useAsyncAction();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (!isEdit && slug.trim().length === 0) {
      fail("Slug is required.");
      return;
    }
    if (title.trim().length === 0) {
      fail("Title is required.");
      return;
    }

    const input = {
      title: title.trim(),
      theme: theme.trim() || undefined,
      sortKey: sortKey.trim() || undefined,
    };

    if (isEdit) {
      run(() => updateStickerPackAction(pack.id, input), {
        onSuccess: () => router.refresh(),
        fallbackMessage: "Could not save the pack. Please try again.",
      });
    } else {
      run(() => createStickerPackAction({ slug: slug.trim(), ...input }), {
        onSuccess: () => {
          router.refresh();
          setSlug("");
          setTitle("");
          setTheme("");
          setSortKey("");
        },
        fallbackMessage: "Could not create the pack. Please try again.",
      });
    }
  }

  const errorMessage = error ?? undefined;

  function clearError() {
    if (error !== null || succeeded) reset();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={slugId}
          label="Slug"
          hint={isEdit ? "Can't be changed after creation." : undefined}
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
              placeholder="woodland-friends"
              autoComplete="off"
              maxLength={80}
              disabled={pending || isEdit}
              invalid={Boolean(!isEdit && errorMessage?.startsWith("Slug"))}
            />
          )}
        </Field>

        <Field id={themeId} label="Theme" optional>
          {(field) => (
            <TextInput
              {...field}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Woodland"
              autoComplete="off"
              maxLength={120}
              disabled={pending}
            />
          )}
        </Field>

        <Field id={sortId} label="Sort" optional hint="Lower sorts first in the shop.">
          {(field) => (
            <TextInput
              {...field}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              placeholder="a"
              autoComplete="off"
              maxLength={20}
              disabled={pending}
            />
          )}
        </Field>
      </div>

      <Field
        id={titleId}
        label="Title"
        error={errorMessage?.startsWith("Title") ? errorMessage : undefined}
      >
        {(field) => (
          <TextInput
            {...field}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearError();
            }}
            placeholder="Woodland Friends"
            autoComplete="off"
            maxLength={120}
            disabled={pending}
            invalid={Boolean(errorMessage?.startsWith("Title"))}
          />
        )}
      </Field>

      {errorMessage && !errorMessage.startsWith("Slug") && !errorMessage.startsWith("Title") && (
        <StatusMessage tone="error">{errorMessage}</StatusMessage>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="sm" disabled={pending}>
          {isEdit ? (
            <FloppyDiskIcon weight="bold" className="size-4" />
          ) : (
            <PlusIcon weight="bold" className="size-4" />
          )}
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create pack"}
        </Button>

        {succeeded && <StatusMessage tone="success">{isEdit ? "Saved." : "Pack created."}</StatusMessage>}
      </div>
    </form>
  );
}
