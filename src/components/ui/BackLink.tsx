import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

/**
 * The three hover treatments the inline back-links used before this primitive
 * unified their structure. Kept as exact, static class strings (JIT-safe) so
 * every adopting call site renders byte-for-byte what it did inline:
 *   - underline:  parent learner / settings / activity back-links
 *   - transition: admin program detail / edit back-links
 *   - plain:      the curriculum back-link (which supplies its own caret icon)
 */
type BackLinkVariant = "underline" | "transition" | "plain";

const VARIANT_CLASS: Record<BackLinkVariant, string> = {
  underline:
    "inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline",
  transition:
    "inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink",
  plain: "inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink",
};

/** Default leading-arrow weight per variant, matching each original markup. */
const VARIANT_ARROW_WEIGHT: Record<BackLinkVariant, "bold" | "regular"> = {
  underline: "bold",
  transition: "regular",
  plain: "bold",
};

export type BackLinkProps = {
  href: string;
  label: string;
  /** Hover/arrow style of the original call site. Defaults to the parent
   *  surface's underline-on-hover treatment. */
  variant?: BackLinkVariant;
  /** Overrides the default back-arrow (e.g. the curriculum caret) while keeping
   *  the variant's text style. */
  icon?: ReactNode;
};

/**
 * The standard "back" navigation link shown above parent/admin detail pages: a
 * small ink-soft text link with a leading back-arrow. Unifies the six
 * hand-rolled variants' structure into one primitive while preserving each
 * call site's original hover treatment, arrow weight, destination (`href`) and
 * visible `label` exactly.
 */
export function BackLink({ href, label, variant = "underline", icon }: BackLinkProps) {
  return (
    <Link href={href} className={VARIANT_CLASS[variant]}>
      {icon ?? <ArrowLeftIcon weight={VARIANT_ARROW_WEIGHT[variant]} className="size-4" />}
      {label}
    </Link>
  );
}
