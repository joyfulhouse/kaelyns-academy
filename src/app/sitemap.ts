import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * Public marketing surface only. `/` is the marketing home and `/learn` is the
 * public explore picker (guests see every program — no auth gate in the learner
 * layout). Authenticated/admin/parent surfaces and API routes are intentionally
 * excluded (and disallowed in robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: SITE_ORIGIN,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_ORIGIN}/learn`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
