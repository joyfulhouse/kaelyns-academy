"use client";

import { useState, type ReactNode } from "react";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * A small collapsible section for admin inline-edit affordances (the
 * sticker/quest/interest list rows' "Add"/"Edit" panels). Uses the same
 * caret + toggle-button vocabulary as the program editor's
 * UnitFields/LessonFields disclosures (`src/components/admin/editor/`)
 * instead of a bare unstyled `<details>/<summary>`, so every admin surface
 * shares one expand/collapse affordance.
 */
export function InlineDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
      >
        {open ? (
          <CaretDownIcon weight="regular" className="size-3.5" />
        ) : (
          <CaretRightIcon weight="regular" className="size-3.5" />
        )}
        {label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
