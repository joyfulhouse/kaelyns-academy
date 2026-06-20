"use client";

import { useEffect, useState } from "react";
import { ShareIcon, XIcon } from "@phosphor-icons/react";
import { shouldShowIosHint } from "@/lib/pwa/iosHint";

const DISMISS_KEY = "ka-ios-a2hs-dismissed";

export function IosInstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const shouldShow = shouldShowIosHint({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      isStandalone,
      dismissed: localStorage.getItem(DISMISS_KEY) === "1",
    });
    // Schedule state update after the effect body to satisfy react-hooks/set-state-in-effect.
    const id = setTimeout(() => {
      setShow(shouldShow);
    }, 0);
    return () => {
      clearTimeout(id);
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  return (
    <div
      role="dialog"
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
