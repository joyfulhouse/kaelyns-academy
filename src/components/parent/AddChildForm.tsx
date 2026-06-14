"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircleIcon, PlusIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { createLearnerAction } from "@/app/(parent)/actions";

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

type FormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; name: string };

export function AddChildForm() {
  const router = useRouter();
  const nameId = useId();
  const monthId = useId();
  const [name, setName] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    // Cheap client guard so the required-field error is instant; the server
    // re-validates regardless (it is the source of truth).
    if (name.trim().length === 0) {
      setState({ status: "error", message: "Please enter a name." });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createLearnerAction({ displayName: name, birthMonth });
        if (result.ok) {
          setState({ status: "success", name: result.learner.displayName });
          setName("");
          setBirthMonth("");
          router.refresh();
        } else {
          setState({ status: "error", message: result.message });
        }
      } catch {
        setState({
          status: "error",
          message: "We could not add the learner right now. Please try again in a moment.",
        });
      }
    });
  }

  const errorMessage = state.status === "error" ? state.message : undefined;

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
                if (state.status !== "idle") setState({ status: "idle" });
              }}
              placeholder="First name or nickname"
              autoComplete="off"
              maxLength={40}
              invalid={Boolean(errorMessage)}
              disabled={isPending}
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
              disabled={isPending}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="accent" size="md" disabled={isPending}>
          <PlusIcon weight="bold" className="size-4" />
          {isPending ? "Adding…" : "Add a child"}
        </Button>

        {state.status === "success" && (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircleIcon weight="fill" className="size-4" />
            {state.name} is enrolled. Welcome aboard.
          </span>
        )}

        {state.status === "error" && !errorMessage && (
          <span role="alert" className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
            <WarningCircleIcon weight="regular" className="size-4" />
            Something went wrong.
          </span>
        )}
      </div>
    </form>
  );
}
