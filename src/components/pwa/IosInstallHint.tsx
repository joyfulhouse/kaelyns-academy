"use client";

import { useSyncExternalStore } from "react";
import { ShareIcon, XIcon } from "@phosphor-icons/react";
import { shouldShowIosHint } from "@/lib/pwa/iosHint";

const DISMISS_KEY = "ka-ios-a2hs-dismissed";
const HINT_CHANGE = "ka-ios-hint-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(HINT_CHANGE, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(HINT_CHANGE, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  return shouldShowIosHint({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    dismissed: localStorage.getItem(DISMISS_KEY) === "1",
  });
}

function getServerSnapshot(): boolean {
  return false;
}

export function IosInstallHint() {
  const show = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    window.dispatchEvent(new Event(HINT_CHANGE));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Install Kaelyn's Academy"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-paper-raised px-4 py-3 shadow-lg"
    >
      <ShareIcon weight="bold" className="size-6 shrink-0 text-honey-deep" />
      <p className="text-sm text-ink-soft">
        Install Kaelyn&rsquo;s Academy: tap{" "}
        <span className="font-semibold text-ink">Share</span> then{" "}
        <span className="font-semibold text-ink">Add to Home Screen</span>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto shrink-0 rounded-full p-1 text-ink-faint hover:text-ink"
      >
        <XIcon weight="bold" className="size-5" />
      </button>
    </div>
  );
}
