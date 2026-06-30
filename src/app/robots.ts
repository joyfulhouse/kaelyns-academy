import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site";

/**
 * Allow crawling of the public marketing surface; keep the authenticated parent
 * and admin areas, the API routes, and the dynamic nested learner routes
 * (/learn/<program>/...) out of the index. Exact /learn stays crawlable — it is
 * the sitemap's canonical public entry — while the "/learn/" prefix (trailing
 * slash) blocks the deeper child-facing routes, which return 200 fallback states
 * for unknown ids and are not SEO landing pages. Points crawlers at the sitemap
 * for the canonical public route list.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/parent", "/api", "/learn/"],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
