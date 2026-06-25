import type { MetadataRoute } from "next";

const BASE_URL = "https://kaelyns.academy";

/**
 * Allow crawling of the public marketing surface; keep the authenticated parent
 * and admin areas plus API routes out of the index. Points crawlers at the
 * sitemap for the canonical public route list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/parent", "/api"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
