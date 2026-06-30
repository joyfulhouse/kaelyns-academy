import { describe, expect, it } from "vitest";
import { SITE_ORIGIN, SITE_DESCRIPTION, studioTitle } from "./site";

// site.ts is the single source of truth for the values the metadata routes used
// to hardcode. These guard that the emitted bytes (metadataBase, JSON-LD @ids,
// robots/sitemap URLs, the OG/description copy) stay exactly what they were.

describe("site constants", () => {
  it("keeps the canonical origin with no trailing slash", () => {
    expect(SITE_ORIGIN).toBe("https://kaelyns.academy");
  });

  it("keeps the full marketing description verbatim", () => {
    expect(SITE_DESCRIPTION).toBe(
      "A warm, adaptive learning studio for young children. Every subject meets each child at her real level and teaches forward, one mastered skill at a time, with gentle AI tutoring.",
    );
  });
});

describe("studioTitle", () => {
  it("uses the resolved program/unit/activity title when present", () => {
    expect(studioTitle("Summer Bridge")).toEqual({ title: "Summer Bridge" });
  });

  it("falls back to the generic Studio title when nothing resolved", () => {
    expect(studioTitle(undefined)).toEqual({ title: "Studio" });
  });
});
