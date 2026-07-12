import type { TutorSession } from "@/app/(learner)/actions";

export type LearnerMode = "loading" | "account" | "guest" | "error";
export type SessionResolution = TutorSession["status"] | "loading";

export function resolveLearnerMode(status: SessionResolution): LearnerMode {
  if (status === "loading") return "loading";
  if (status === "authenticated") return "account";
  if (status === "unauthenticated") return "guest";
  return "error";
}

export function accountLearnerSelectionRequired(
  mode: LearnerMode,
  selectedLearnerId: string | null,
): boolean {
  return mode === "account" && selectedLearnerId === null;
}

export function recordingDestination(
  mode: LearnerMode,
  selectedLearnerId: string | null,
): "account" | "guest" | "blocked" {
  if (mode === "account") return selectedLearnerId ? "account" : "blocked";
  return mode === "guest" ? "guest" : "blocked";
}
