import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

export type BackLinkProps = {
  href: string;
  label: string;
  /** Overrides the default back-arrow (e.g. a caret) while keeping the unified
   *  text style. */
  icon?: ReactNode;
};

/**
 * The standard "back" navigation link shown above parent/admin detail pages: a
 * small ink-soft text link with a leading back-arrow that underlines on hover.
 * Unifies the six hand-rolled variants onto one consistent style; each page's
 * own destination (`href`) and visible `label` are preserved.
 */
export function BackLink({ href, label, icon }: BackLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
    >
      {icon ?? <ArrowLeftIcon weight="bold" className="size-4" />}
      {label}
    </Link>
  );
}
