import type { MetadataRoute } from "next";

const BASE_URL = "https://kaelyns.academy";

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
      url: BASE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/learn`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
