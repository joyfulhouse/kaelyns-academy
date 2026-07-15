/** Persistent, non-answer-revealing coaching shown after a wrong check. */
export function RetryFeedback({ message }: { message: string | null }) {
  return (
    <div className="min-h-7 text-center">
      {message ? (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="font-display text-lg text-ink"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
