/// <reference lib="webworker" />
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  RangeRequestsPlugin,
  Serwist,
} from "serwist";
import { isAudioRequest } from "../lib/pwa/cacheRules";
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
  ],
  fallbacks: {
    entries: [
      { url: "/~offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();
