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
import { createLearnerAction } from "@/app/(parent)/actions";
import { HandoffButton } from "@/components/parent/HandoffButton";

/**
 * "Add a child" form on the parent learners page. Calm and honest: a name (the
 * only required field), an optional birth month (the only other learner datum
 * the platform keeps, spec §8), and real validation / error / success states.
 * Submits to the createLearnerAction server action; on success it refreshes the
 * route so the new learner appears in the real list above.
 */

const MONTH_OPTIONS = [
  { value: "", label: "Prefer not to say" },
  { value: "January", label: "January" },
  { value: "February", label: "February" },
  { value: "March", label: "March" },
  { value: "April", label: "April" },
  { value: "May", label: "May" },
  { value: "June", label: "June" },
  { value: "July", label: "July" },
  { value: "August", label: "August" },
  { value: "September", label: "September" },
  { value: "October", label: "October" },
  { value: "November", label: "November" },
  { value: "December", label: "December" },
];

export function AddChildForm() {
  const router = useRouter();
  const nameId = useId();
  const monthId = useId();
  const [name, setName] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  // The just-added learner, for the success confirmation + one-tap handoff.
  const [savedLearner, setSavedLearner] = useState<{ id: string; displayName: string } | null>(null);
  const { run, pending, error, succeeded, reset, fail } = useAsyncAction();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    // Cheap client guard so the required-field error is instant; the server
    // re-validates regardless (it is the source of truth).
    if (name.trim().length === 0) {
      fail("Please enter a name.");
      return;
    }

    run(() => createLearnerAction({ displayName: name, birthMonth }), {
      onSuccess: (result) => {
        setSavedLearner({ id: result.learner.id, displayName: result.learner.displayName });
        setName("");
        setBirthMonth("");
        router.refresh();
      },
      fallbackMessage: "We could not add the learner right now. Please try again in a moment.",
    });
  }

  // The server/guard error renders in the name Field; the badge below is a
  // defensive fallback for an error state with no displayable message.
  const errorMessage = error ?? undefined;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <Field id={nameId} label="Child's name" error={errorMessage}>
          {(field) => (
            <TextInput
              {...field}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error !== null || succeeded) reset();
              }}
              placeholder="First name or nickname"
              autoComplete="off"
              maxLength={40}
              invalid={Boolean(errorMessage)}
              disabled={pending}
            />
          )}
        </Field>

        <Field
          id={monthId}
          label="Birth month"
          optional
          hint="Helps us pitch activities. Never a full birth date."
        >
          {(field) => (
            <Select
              {...field}
              options={MONTH_OPTIONS}
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              disabled={pending}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="md" disabled={pending}>
          <PlusIcon weight="bold" className="size-4" />
          {pending ? "Adding…" : "Add a child"}
        </Button>

        {succeeded && savedLearner && (
          <div className="flex w-full flex-col items-start gap-3 rounded-lg border border-line bg-accent/8 p-4">
            <StatusMessage tone="success">
              {savedLearner.displayName} is enrolled. Welcome aboard.
            </StatusMessage>
            <p className="text-sm text-ink-soft">
              {savedLearner.displayName} learns on this device through your account — no child login.
            </p>
            <HandoffButton
              learnerId={savedLearner.id}
              learnerName={savedLearner.displayName}
            />
          </div>
        )}

        {error !== null && error.length === 0 && (
          <StatusMessage tone="error">Something went wrong.</StatusMessage>
        )}
      </div>
    </form>
  );
}
