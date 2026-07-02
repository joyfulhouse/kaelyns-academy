import type { Metadata } from "next";
import { studioTitle } from "@/lib/site";
import { InterestPicker } from "@/components/learner/InterestPicker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = studioTitle("My Favorite Things");

/**
 * The child interest picker (Task 9 / spec §4.3). Not nested under a program
 * slug — interests are learner-wide, not per-world — so this sits directly
 * under `/learn`, a sibling of the program picker.
 */
export default function InterestsPage() {
  return <InterestPicker />;
}
