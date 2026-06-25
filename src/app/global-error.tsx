"use client";

import { useEffect } from "react";
import { captureNonCritical } from "@/lib/capture";

/**
 * Last-resort error boundary: it replaces the *root* layout, so it must render
 * its own <html>/<body>. The root layout (fonts, globals.css, providers) is
 * presumed broken here, so this stays deliberately dependency-light and inlines
 * its own Wonder-Studio palette rather than relying on design-token classes that
 * may not have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureNonCritical("Global error boundary", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          textAlign: "center",
          backgroundColor: "#fdf6e9",
          color: "#2b2118",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          lineHeight: 1.6,
        }}
      >
        {/* globals.css (and its :focus-visible rule) is presumed unloaded here,
            so the only interactive control inlines its own keyboard focus ring. */}
        <style>{`.ge-retry:focus-visible{outline:3px solid #2b2118;outline-offset:3px;}`}</style>
        <div style={{ maxWidth: "28rem" }}>
          <div aria-hidden style={{ fontSize: "3.5rem", lineHeight: 1 }}>
            ⭐
          </div>
          <h1
            style={{
              marginTop: "1.25rem",
              fontSize: "1.875rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            We&rsquo;ll be right back.
          </h1>
          <p style={{ marginTop: "0.75rem", fontSize: "1.125rem", opacity: 0.8 }}>
            Something stopped Kaelyn&rsquo;s Academy from loading. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="ge-retry"
            style={{
              marginTop: "2rem",
              cursor: "pointer",
              border: "3px solid #2b2118",
              borderRadius: "1rem",
              backgroundColor: "#f4b740",
              color: "#2b2118",
              padding: "1rem 2rem",
              fontSize: "1.125rem",
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
