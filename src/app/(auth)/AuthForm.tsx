"use client";

import { useState, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRightIcon,
  EnvelopeSimpleIcon,
  LockKeyIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TextInput } from "@/components/ui/TextInput";
import { Mascot } from "@/components/art/Mascot";
import { signIn, signUp } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REDIRECT_TO = "/parent";

function validate(mode: Mode, values: { name: string; email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "sign-up" && values.name.trim().length < 2) {
    errors.name = "Please enter your name.";
  }
  if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (mode === "sign-up") {
    if (values.password.length < 8) {
      errors.password = "Use at least 8 characters.";
    }
  } else if (values.password.length === 0) {
    errors.password = "Enter your password.";
  }
  return errors;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const values = { name, email, password };
    const errors = validate(mode, values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    const result = isSignUp
      ? await signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          callbackURL: REDIRECT_TO,
        })
      : await signIn.email({ email: email.trim(), password, callbackURL: REDIRECT_TO });

    if (result.error) {
      setPending(false);
      setFormError(
        result.error.message ??
          (isSignUp
            ? "We could not create your account. That email may already be in use."
            : "That email and password did not match. Please try again."),
      );
      return;
    }

    // Keep the button busy through navigation so it never looks idle on success.
    router.push(REDIRECT_TO);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <Mascot size={72} mood="wave" />
        <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight">
          {isSignUp ? "Create your parent account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-base text-ink-soft">
          {isSignUp
            ? "One calm place to follow your child's learning."
            : "Sign in to see how your learner is doing."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-5">
        {isSignUp && (
          <Field id="name" label="Your name" error={fieldErrors.name}>
            {(field) => (
              <TextInput
                {...field}
                type="text"
                autoComplete="name"
                placeholder="Alex Rivera"
                value={name}
                invalid={Boolean(fieldErrors.name)}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
        )}

        <Field id="email" label="Email" error={fieldErrors.email}>
          {(field) => (
            <TextInput
              {...field}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              icon={<EnvelopeSimpleIcon className="size-5" />}
              value={email}
              invalid={Boolean(fieldErrors.email)}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field
          id="password"
          label="Password"
          hint={isSignUp ? "At least 8 characters." : undefined}
          error={fieldErrors.password}
        >
          {(field) => (
            <TextInput
              {...field}
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="••••••••"
              icon={<LockKeyIcon className="size-5" />}
              value={password}
              invalid={Boolean(fieldErrors.password)}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/8 px-3.5 py-2.5 text-sm font-medium text-danger"
          >
            <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" disabled={pending} className="mt-1 w-full">
          {pending ? (
            <>
              <SpinnerGapIcon weight="bold" className="size-5 motion-safe:animate-spin" />
              {isSignUp ? "Creating account" : "Signing in"}
            </>
          ) : (
            <>
              {isSignUp ? "Create account" : "Sign in"}
              <ArrowRightIcon weight="bold" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-soft">
        {isSignUp ? "Already have an account? " : "New to Kaelyn's Academy? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-accent-deep underline-offset-2 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </div>
  );
}
