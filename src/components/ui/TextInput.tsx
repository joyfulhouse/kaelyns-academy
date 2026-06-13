import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Calm parent/auth text input (DESIGN.md §5): hairline `--line` border, md
 * radius, paper-raised fill, visible focus, ink text. Pairs with <Field/> for
 * label + error. `invalid` swaps the hairline for a danger border; an optional
 * leading icon (decorative) sits inside the field.
 */
export function TextInput({
  invalid,
  icon,
  className,
  ...props
}: ComponentPropsWithoutRef<"input"> & {
  invalid?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex items-center">
      {icon && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 grid place-items-center text-ink-faint"
        >
          {icon}
        </span>
      )}
      <input
        className={cn(
          "min-h-11 w-full rounded-md border bg-paper-raised text-base text-ink",
          "px-3.5 py-2.5 transition-colors duration-200 ease-out-quart",
          "placeholder:text-ink-faint",
          "focus:border-accent focus:outline-none focus-visible:outline-none",
          invalid
            ? "border-danger focus:border-danger"
            : "border-line hover:border-line-strong",
          icon ? "pl-10" : "",
          className,
        )}
        {...props}
      />
    </div>
  );
}
