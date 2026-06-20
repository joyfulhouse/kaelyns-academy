/// <reference lib="webworker" />
import { Serwist } from "serwist";
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
  runtimeCaching: [],
  fallbacks: {
    entries: [
      { url: "/~offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

serwist.addEventListeners();
