import type { Metadata } from "next";

/**
 * Site-wide metadata constants. The single source of truth for the things that
 * were previously copy-pasted across the metadata routes:
 *   - SITE_ORIGIN: every absolute URL we emit (metadataBase, canonical/OG URLs,
 *     JSON-LD @ids + logo, robots host + sitemap, sitemap entries).
 *   - SITE_DESCRIPTION: the full marketing description shared by the root
 *     metadata (description + OpenGraph/Twitter) and the home page's
 *     EducationalOrganization JSON-LD.
 *
 * Pure module: the only import is the type-only `Metadata` (erased at build), so
 * the metadata routes that pull these constants in stay free of any runtime
 * dependency.
 */

/** Canonical production origin, no trailing slash. */
export const SITE_ORIGIN = "https://kaelyns.academy";

/**
 * The full marketing description. manifest.ts and opengraph-image.tsx
 * intentionally use their own shorter variants, so they are left as-is.
 */
export const SITE_DESCRIPTION =
  "A warm, adaptive learning studio for young children. Every subject meets each child at her real level and teaches forward, one mastered skill at a time, with gentle AI tutoring.";

/**
 * Build the `<title>` Metadata for a learner ("Studio") page from an already
 * resolved program / unit / activity title, falling back to the generic
 * "Studio" when nothing resolved. Centralizes the `?? "Studio"` fallback the
 * three `/learn` generateMetadata functions share.
 *
 * Deliberately generic: a learner page title must never carry a child's name
 * (spec §8 — titles leak into browser history, OS window/tab previews, and
 * client telemetry such as Sentry breadcrumbs).
 */
export function studioTitle(title: string | undefined): Metadata {
  return { title: title ?? "Studio" };
}
