import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Studio",
};

/**
 * Learner route group. The root layout owns <html>/<body>; each learner page
 * wraps its content in <AppShellKid> (which applies `.surface-kid` and the
 * per-world accent), so this layout is a simple passthrough.
 */
export default function LearnerLayout({ children }: { children: ReactNode }) {
  return children;
}
