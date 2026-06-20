/// <reference lib="webworker" />
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  RangeRequestsPlugin,
  Serwist,
} from "serwist";
import { isAudioRequest, isImmutableStaticAsset } from "../lib/pwa/cacheRules";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Runtime caching is added in Tasks 3 (audio) and 4 (static). We intentionally do NOT
  // import Serwist's `defaultCache` — navigations/RSC/API stay network-only so no
  // authenticated content is ever persisted. Offline document requests hit the fallback.
  runtimeCaching: [
    // Clips are immutable per key → CacheFirst. RangeRequestsPlugin serves byte ranges
    // from the cached full response (the <audio> element issues Range requests).
    {
      matcher: ({ url, sameOrigin }) => isAudioRequest(url, sameOrigin),
      handler: new CacheFirst({
        cacheName: "audio-clips",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new RangeRequestsPlugin(),
          new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
    // Content-hashed → safe to cache long-term; old entries fall out of the manifest on deploy.
    {
      matcher: ({ url, sameOrigin }) => isImmutableStaticAsset(url, sameOrigin),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 90 * 24 * 60 * 60 }),
        ],
      }),
    },
    {
      // Navigations are network-only — never cache authenticated HTML/RSC. Routing them
      // through the SW lets the `fallbacks` catch handler serve the precached /~offline
      // page when the network is unavailable (NetworkOnly throws offline → fallback).
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      { url: "/~offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();
