"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { validateConfigJson } from "@/lib/admin/editor-model";

interface ConfigEditorProps {
  kind: string;
  value: string;
  onChange: (json: string) => void;
  /** Called with `true` when config is valid, `false` when not. */
  onValidChange?: (valid: boolean) => void;
  error?: string | null;
}

/**
 * A textarea bound to the raw JSON string of `activity.config`.
 * - Validates on every change against the kind's Zod schema.
 * - Shows inline schema errors passed from the parent.
 * - The parent (`ActivityFields`) is responsible for seeding a skeleton when
 *   `kind` changes; this component is purely a controlled textarea + error display.
 * - Reports validity via `onValidChange` so the root form can gate Save.
 * - On initial render or when `value` / `kind` changes from outside, reports
 *   the current validity (runs in a layoutEffect to avoid setState-in-effect).
 */
export function ConfigEditor({
  kind,
  value,
  onChange,
  onValidChange,
  error,
}: ConfigEditorProps) {
  // Report validity whenever value or kind changes (layout effect to avoid
  // the set-state-in-effect lint rule — this only calls the parent callback).
  useEffect(() => {
    if (!onValidChange) return;
    const result = validateConfigJson(kind, value);
    onValidChange(result.ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: sync parent on mount/kind-or-value change
  }, [kind, value]);

  function handleChange(raw: string) {
    onChange(raw);
    const result = validateConfigJson(kind, raw);
    onValidChange?.(result.ok);
  }

  // Derive error from value on-the-fly so it's always in sync.
  const localError = (() => {
    if (error !== undefined) return error;
    const result = validateConfigJson(kind, value);
    return result.ok ? null : result.message;
  })();

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-ink-soft">Config JSON</label>
      <textarea
        className={cn(
          "min-h-40 w-full rounded-md border bg-paper-sunk font-mono text-xs text-ink",
          "px-3 py-2 transition-colors duration-200 ease-out-quart",
          "focus:border-accent focus:outline-none focus-visible:outline-none",
          localError
            ? "border-danger focus:border-danger"
            : "border-line hover:border-line-strong",
        )}
        value={value}
        onChange={(e) => { handleChange(e.target.value); }}
        spellCheck={false}
        aria-label="Activity config JSON"
        aria-invalid={localError ? true : undefined}
      />
      {localError && (
        <p role="alert" className="text-xs font-medium text-danger">
          {localError}
        </p>
      )}
    </div>
  );
}
