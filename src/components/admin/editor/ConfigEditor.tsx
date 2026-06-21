"use client";

import { cn } from "@/lib/cn";
import { validateConfigJson } from "@/lib/admin/editor-model";

interface ConfigEditorProps {
  kind: string;
  value: string;
  onChange: (json: string) => void;
  /** Called with `true` when config is valid, `false` when not. */
  onValidChange?: (valid: boolean) => void;
}

/**
 * A textarea bound to the raw JSON string of `activity.config`.
 * - Validates on every change against the kind's Zod schema.
 * - Shows inline schema errors derived from the current value.
 * - The parent (`ActivityFields`) is responsible for seeding a skeleton when
 *   `kind` changes and for reporting initial validity on mount.
 * - No useEffect: validity is reported synchronously on every onChange call.
 */
export function ConfigEditor({
  kind,
  value,
  onChange,
  onValidChange,
}: ConfigEditorProps) {
  function handleChange(raw: string) {
    onChange(raw);
    const result = validateConfigJson(kind, raw);
    onValidChange?.(result.ok);
  }

  const validation = validateConfigJson(kind, value);
  const localError = validation.ok ? null : validation.message;

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
