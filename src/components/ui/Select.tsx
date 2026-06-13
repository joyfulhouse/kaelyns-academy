import type { ComponentPropsWithoutRef } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Calm parent/auth select (DESIGN.md §5): hairline `--line` border, md radius,
 * paper-raised fill, a regular-weight caret. Native <select> for full keyboard
 * + screen-reader support. Pairs with <Field/> for label + error.
 */
export function Select({
  options,
  invalid,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"select">, "children"> & {
  options: SelectOption[];
  invalid?: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <select
        className={cn(
          "min-h-11 w-full appearance-none rounded-md border bg-paper-raised text-base text-ink",
          "px-3.5 py-2.5 pr-10 transition-colors duration-200 ease-out-quart",
          "focus:border-accent focus:outline-none focus-visible:outline-none",
          invalid
            ? "border-danger focus:border-danger"
            : "border-line hover:border-line-strong",
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 size-4 text-ink-faint"
      />
    </div>
  );
}
