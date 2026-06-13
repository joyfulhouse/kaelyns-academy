import { notFound } from "next/navigation";
import { getProgram } from "@/content";
import { StudioHome } from "@/components/learner/StudioHome";
import { PROGRAM_SLUG } from "@/components/learner/activityMeta";

export default function LearnPage() {
  const program = getProgram(PROGRAM_SLUG);
  if (!program) notFound();
  return <StudioHome program={program} />;
}
