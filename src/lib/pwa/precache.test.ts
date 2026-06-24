import { describe, expect, it } from "vitest";
import {
  PRECACHE_GLOB_PATTERNS,
  SERWIST_CACHE_CONTROL,
  SERWIST_ROUTE_SOURCE,
  precacheExcludesNextChunks,
} from "./precache";

describe("precache glob patterns (Fix 1: lean precache)", () => {
  it("precaches only stable public/ assets", () => {
    expect([...PRECACHE_GLOB_PATTERNS]).toEqual(["public/**/*"]);
  });

  it("never matches a content-hashed /_next build chunk", () => {
    // Guards against re-adding the default `<distDir>static/**` glob that pulled in
    // every /_next/static/chunks/*.js — the thing that makes atomic precache fragile.
    expect(precacheExcludesNextChunks(PRECACHE_GLOB_PATTERNS)).toBe(true);
  });

  it("precacheExcludesNextChunks flags any build-output glob", () => {
    expect(precacheExcludesNextChunks([".next/static/**/*.{js,css}", "public/**/*"])).toBe(false);
    expect(precacheExcludesNextChunks(["/_next/**"])).toBe(false);
    expect(precacheExcludesNextChunks([".next/server/**"])).toBe(false);
    // hardened: a `static/` segment is rejected even without an `_next`/`.next` token
    expect(precacheExcludesNextChunks(["assets/static/chunks/**"])).toBe(false);
    expect(precacheExcludesNextChunks(["public/**/*"])).toBe(true);
  });
});

describe("serwist Cache-Control policy (Fix 2: no year-long edge cache)", () => {
  it("scopes the header to the whole /serwist/* tree", () => {
    expect(SERWIST_ROUTE_SOURCE).toBe("/serwist/:path*");
  });

  it("forces revalidation and never pins at the CDN for a year", () => {
    expect(SERWIST_CACHE_CONTROL).toBe("public, max-age=0, must-revalidate");
    expect(SERWIST_CACHE_CONTROL).not.toContain("s-maxage");
    expect(SERWIST_CACHE_CONTROL).toContain("must-revalidate");
    expect(SERWIST_CACHE_CONTROL).toContain("max-age=0");
  });
});
