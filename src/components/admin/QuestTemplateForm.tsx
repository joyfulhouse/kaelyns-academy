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
import { createQuestTemplateAction, updateQuestTemplateAction } from "@/app/(admin)/admin/motivation-actions";
import type { AdminQuestTemplateRow } from "@/lib/quests/admin-store";
import type { QuestKind } from "@/lib/quests/config";

const KIND_OPTIONS: { value: QuestKind; label: string }[] = [
  { value: "complete_n", label: "Complete N activities" },
  { value: "try_strand", label: "Try a strand" },
  { value: "practice_skill", label: "Practice a skill" },
];

function initialCount(template: AdminQuestTemplateRow | undefined): string {
  if (template?.kind !== "complete_n") return "3";
  const count = (template.params as { count?: unknown } | null)?.count;
  return typeof count === "number" ? String(count) : "3";
}

/**
 * Create/edit form for a quest template. The `kind` select drives a 3-kind
 * params switch (Task 12 brief): `complete_n` shows a count input; the other
 * two kinds take no params (resolved at daily assignment — see
 * src/lib/quests/logic.ts's selectDailyQuests).
 */
export function QuestTemplateForm({ template }: { template?: AdminQuestTemplateRow }) {
  const router = useRouter();
  const isEdit = template !== undefined;
  const slugId = useId();
  const titleId = useId();
  const kindId = useId();
  const countId = useId();
  const rewardId = useId();

  const [slug, setSlug] = useState(template?.slug ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [kind, setKind] = useState<QuestKind>(template?.kind ?? "complete_n");
  const [count, setCount] = useState(initialCount(template));
  const [rewardStars, setRewardStars] = useState(String(template?.rewardStars ?? 3));

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
    const rewardStarsNum = Number(rewardStars);
    if (!Number.isInteger(rewardStarsNum) || rewardStarsNum < 1 || rewardStarsNum > 20) {
      fail("Reward stars must be a whole number from 1 to 20.");
      return;
    }
    const countNum = Number(count);
    if (kind === "complete_n" && (!Number.isInteger(countNum) || countNum < 1 || countNum > 10)) {
      fail("Count must be a whole number from 1 to 10.");
      return;
    }

    const params = kind === "complete_n" ? { count: countNum } : {};

    if (isEdit) {
      run(
        () =>
          updateQuestTemplateAction(template.id, {
            title: title.trim(),
            kind,
            params,
            rewardStars: rewardStarsNum,
          }),
        {
          onSuccess: () => router.refresh(),
          fallbackMessage: "Could not save the quest template. Please try again.",
        },
      );
    } else {
      run(
        () =>
          createQuestTemplateAction({
            slug: slug.trim(),
            title: title.trim(),
            kind,
            params,
            rewardStars: rewardStarsNum,
          }),
        {
          onSuccess: () => {
            router.refresh();
            setSlug("");
            setTitle("");
            setKind("complete_n");
            setCount("3");
            setRewardStars("3");
          },
          fallbackMessage: "Could not create the quest template. Please try again.",
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
              placeholder="daily-three"
              autoComplete="off"
              maxLength={80}
              disabled={pending || isEdit}
              invalid={Boolean(!isEdit && errorMessage?.startsWith("Slug"))}
            />
          )}
        </Field>

        <Field id={kindId} label="Kind">
          {(field) => (
            <Select
              {...field}
              options={KIND_OPTIONS}
              value={kind}
              onChange={(e) => setKind(e.target.value as QuestKind)}
              disabled={pending}
            />
          )}
        </Field>
      </div>

      <Field
        id={titleId}
        label="Title"
        hint="Use {focus} where the unit/skill name should be inserted."
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
            placeholder="Do 3 activities"
            autoComplete="off"
            maxLength={160}
            disabled={pending}
            invalid={Boolean(errorMessage?.startsWith("Title"))}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "complete_n" ? (
          <Field id={countId} label="Count" hint="How many activities to complete (1–10).">
            {(field) => (
              <TextInput
                {...field}
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={pending}
              />
            )}
          </Field>
        ) : (
          <p className="self-end pb-2.5 text-sm text-ink-faint">
            No extra parameters — resolved automatically at daily assignment.
          </p>
        )}

        <Field id={rewardId} label="Reward stars" hint="1–20.">
          {(field) => (
            <TextInput
              {...field}
              type="number"
              min={1}
              max={20}
              value={rewardStars}
              onChange={(e) => setRewardStars(e.target.value)}
              disabled={pending}
            />
          )}
        </Field>
      </div>

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
          {pending ? "Saving…" : isEdit ? "Save changes" : "Create quest"}
        </Button>

        {succeeded && (
          <StatusMessage tone="success">{isEdit ? "Saved." : "Quest template created."}</StatusMessage>
        )}
      </div>
    </form>
  );
}
