import { useCallback, useState, useTransition } from "react";

/**
 * The project's standard server-action result: a discriminated union on `ok`.
 * Success branches carry their own payload (a learner, an export blob, …); the
 * failure branch carries an optional human `message` (and usually a `reason`).
 */
export type ActionResult = { ok: boolean; message?: string; reason?: string };

const GENERIC_ACTION_ERROR = "Something went wrong. Please try again.";

export interface RunOptions<R extends ActionResult> {
  /** Side-effects after a successful (`ok: true`) result, run inside the transition
   *  (e.g. `router.refresh()`, a redirect, a download, capturing success data). */
  onSuccess?: (result: Extract<R, { ok: true }>) => void;
  /** Map a failed (`ok: false`) result to the message to surface. Defaults to the
   *  result's own `message`. Use this for reason-specific copy (e.g. forbidden). */
  errorMessage?: (result: Extract<R, { ok: false }>) => string;
  /** Take over failure handling (both `ok: false` AND a thrown action) with the
   *  resolved message. When provided, the hook does NOT set its own `error` — the
   *  caller owns where the message renders (e.g. an error keyed by item id). */
  onError?: (message: string) => void;
  /** Message shown when the action throws, and the fallback when an `ok: false`
   *  result has no `message`. */
  fallbackMessage?: string;
}

export interface AsyncAction {
  /** Run an async action inside a transition with a try/catch. Clears any prior
   *  error/success synchronously, flips `pending`, then settles to success/error. */
  run: <R extends ActionResult>(action: () => Promise<R>, options?: RunOptions<R>) => void;
  /** True while the action's transition is in flight. */
  pending: boolean;
  /** The error message to surface, or `null`. Unused when `onError` is supplied. */
  error: string | null;
  /** True after a successful (`ok: true`) result, until the next `run`/`reset`. */
  succeeded: boolean;
  /** Clear `error` + `succeeded` (e.g. when the user edits a field). */
  reset: () => void;
  /** Set an error WITHOUT running an action — for client-side validation that
   *  short-circuits before the server is called. Keeps a single error source. */
  fail: (message: string) => void;
}

/**
 * PURE. Resolve the error message to surface from a settled async action.
 * `result` is the action's resolved value, or `undefined` when the action threw.
 *
 * Precedence: an explicit `errorMessage(result)` mapper wins; else the result's
 * own `message`; else the caller's `fallbackMessage`; else a generic fallback.
 * A thrown action (`result === undefined`) skips the mapper and the result message
 * and goes straight to `fallbackMessage` — the mapper is never called without a
 * result.
 */
export function resolveActionError<R extends ActionResult>(
  result: R | undefined,
  options?: Pick<RunOptions<R>, "errorMessage" | "fallbackMessage">,
): string {
  if (result === undefined) {
    return options?.fallbackMessage ?? GENERIC_ACTION_ERROR;
  }
  return (
    options?.errorMessage?.(result as Extract<R, { ok: false }>) ??
    result.message ??
    options?.fallbackMessage ??
    GENERIC_ACTION_ERROR
  );
}

/**
 * The async-action state machine duplicated across ~12 parent/admin forms:
 * `useTransition` for the pending flag, a try/catch around the awaited action,
 * an error string on `ok: false` or a throw, and a success flag on `ok: true`.
 *
 * Callers compose their own richer state on top via the `run` callbacks
 * (success payloads, errors keyed by item id, "are we confirming?" UI), while
 * the boilerplate lives here once. Returns {@link AsyncAction}.
 */
export function useAsyncAction(): AsyncAction {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const reset = useCallback(() => {
    setError(null);
    setSucceeded(false);
  }, []);

  const fail = useCallback((message: string) => {
    setSucceeded(false);
    setError(message);
  }, []);

  const run = <R extends ActionResult>(
    action: () => Promise<R>,
    options?: RunOptions<R>,
  ): void => {
    setError(null);
    setSucceeded(false);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setSucceeded(true);
          options?.onSuccess?.(result as Extract<R, { ok: true }>);
        } else {
          const message = resolveActionError(result, options);
          if (options?.onError) options.onError(message);
          else setError(message);
        }
      } catch {
        // A throw here can come from the action OR from an onSuccess side-effect
        // (router.refresh, a download, …) that ran after `setSucceeded(true)`.
        // Clear succeeded so the result settles to error-only — success and
        // error are mutually exclusive, matching the single-state machines this
        // hook replaced (which couldn't show both at once).
        setSucceeded(false);
        const message = resolveActionError<R>(undefined, options);
        if (options?.onError) options.onError(message);
        else setError(message);
      }
    });
  };

  return { run, pending, error, succeeded, reset, fail };
}
