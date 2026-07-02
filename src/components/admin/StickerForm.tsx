"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, FloppyDiskIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { useAsyncAction } from "@/lib/hooks/useAsyncAction";
import { createStickerAction, updateStickerAction } from "@/app/(admin)/admin/motivation-actions";
import type { AdminStickerRow } from "@/lib/rewards/admin-store";

/**
 * Create/edit form for one sticker inside a pack. `artRef` is authored as a
 * bare emoji and stored as the v1 "emoji:<1-8 chars>" ref (validated by the
 * store's validateArtRef — see src/lib/rewards/admin-store.ts).
 */
export function StickerForm({ packId, sticker }: { packId: string; sticker?: AdminStickerRow }) {
  const router = useRouter();
  const isEdit = sticker !== undefined;
  const slugId = useId();
  const titleId = useId();
  const emojiId = useId();
  const costId = useId();
  const sortId = useId();

  const [slug, setSlug] = useState(sticker?.slug ?? "");
  const [title, setTitle] = useState(sticker?.title ?? "");
  const [emoji, setEmoji] = useState(sticker?.artRef.replace(/^emoji:/, "") ?? "");
  const [starCost, setStarCost] = useState(String(sticker?.starCost ?? 5));
  const [sortKey, setSortKey] = useState(sticker?.sortKey ?? "");

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
    if (emoji.trim().length === 0) {
      fail("Emoji is required.");
      return;
    }
    const starCostNum = Number(starCost);
    if (!Number.isInteger(starCostNum) || starCostNum < 1 || starCostNum > 100) {
      fail("Star cost must be a whole number from 1 to 100.");
      return;
    }

    const artRef = `emoji:${emoji.trim()}`;
    const sortKeyValue = sortKey.trim() || undefined;

    if (isEdit) {
      run(
        () =>
          updateStickerAction(sticker.id, {
            title: title.trim(),
            artRef,
            starCost: starCostNum,
            sortKey: sortKeyValue,
          }),
        {
          onSuccess: () => router.refresh(),
          fallbackMessage: "Could not save the sticker. Please try again.",
        },
      );
    } else {
      run(
        () =>
          createStickerAction({
            packId,
            slug: slug.trim(),
            title: title.trim(),
            artRef,
            starCost: starCostNum,
            sortKey: sortKeyValue,
          }),
        {
          onSuccess: () => {
            router.refresh();
            setSlug("");
            setTitle("");
            setEmoji("");
            setStarCost("5");
            setSortKey("");
          },
          fallbackMessage: "Could not create the sticker. Please try again.",
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
          hint={isEdit ? "Can't change." : undefined}
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
              placeholder="clever-fox"
              autoComplete="off"
              maxLength={80}
              disabled={pending || isEdit}
              invalid={Boolean(!isEdit && errorMessage?.startsWith("Slug"))}
            />
          )}
        </Field>

        <Field
          id={titleId}
          label="Title"
          className="sm:col-span-1"
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
              placeholder="Clever Fox"
              autoComplete="off"
              maxLength={120}
              disabled={pending}
              invalid={Boolean(errorMessage?.startsWith("Title"))}
            />
          )}
        </Field>

        <Field
          id={emojiId}
          label="Emoji"
          hint="1–8 characters."
          className="sm:col-span-1"
          error={errorMessage?.startsWith("Emoji") ? errorMessage : undefined}
        >
          {(field) => (
            <TextInput
              {...field}
              value={emoji}
              onChange={(e) => {
                setEmoji(e.target.value);
                clearError();
              }}
              placeholder="🦊"
              autoComplete="off"
              maxLength={8}
              disabled={pending}
              invalid={Boolean(errorMessage?.startsWith("Emoji"))}
            />
          )}
        </Field>

        <Field id={costId} label="Star cost" hint="1–100." className="sm:col-span-1">
          {(field) => (
            <TextInput
              {...field}
              type="number"
              min={1}
              max={100}
              value={starCost}
              onChange={(e) => setStarCost(e.target.value)}
              disabled={pending}
            />
          )}
        </Field>

        <Field id={sortId} label="Sort" optional hint="Lower sorts first." className="sm:col-span-1">
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

      {errorMessage &&
        !errorMessage.startsWith("Slug") &&
        !errorMessage.startsWith("Title") &&
        !errorMessage.startsWith("Emoji") && <StatusMessage tone="error">{errorMessage}</StatusMessage>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="soft" size="sm" disabled={pending}>
          {isEdit ? (
            <FloppyDiskIcon weight="bold" className="size-4" />
          ) : (
            <PlusIcon weight="bold" className="size-4" />
          )}
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add sticker"}
        </Button>

        {succeeded && <StatusMessage tone="success">{isEdit ? "Saved." : "Sticker added."}</StatusMessage>}
      </div>
    </form>
  );
}
