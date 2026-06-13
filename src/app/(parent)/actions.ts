"use server";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { captureNonCritical } from "@/lib/capture";
import { getSkill, type SkillOutcome, type SkillTag } from "@/content";
import {
  generateProgressReport,
  type ProgressReport,
  type ProgressReportSkill,
} from "@/lib/ai/report";
import {
  SAMPLE_LEARNER,
  SAMPLE_RECENT,
  SAMPLE_SKILL_STATE,
} from "@/components/parent/sample-data";

/**
 * Parent-gated server action that produces the AI weekly progress report shown
 * on /parent. It is build-safe (getAuth() is lazy and only called per-request
 * here, never at module top level) and resolves the Better Auth session itself
 * so it is safe even if it were ever invoked outside the (parent) layout gate.
 *
 * The report input is built from the SAMPLE data for now (no attempt DB yet),
 * mapped through getSkill so the model sees real skill labels + strands. The
 * surface marks the result as Sample accordingly.
 *
 * TODO(P6): build input from real DB skill_state via withAccount() (the tenancy
 * seam in @/lib/tenancy), replacing the SAMPLE_* sources below.
 */

/** Discriminated result so the client renders calm states, never a thrown stack. */
export type ProgressReportResult =
  | { ok: true; report: ProgressReport; sample: true }
  | { ok: false; reason: "unauthenticated" | "unavailable" };

/** Map sample skill_state slugs to the labelled shape the report grounds on. */
function buildSampleSkills(): ProgressReportSkill[] {
  const skills: ProgressReportSkill[] = [];
  for (const [slug, outcome] of Object.entries(SAMPLE_SKILL_STATE) as [
    SkillTag,
    SkillOutcome | undefined,
  ][]) {
    if (!outcome) continue;
    const skill = getSkill(slug);
    if (!skill) continue;
    skills.push({ label: skill.label, domain: skill.domain, outcome });
  }
  return skills;
}

export async function requestProgressReport(): Promise<ProgressReportResult> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, reason: "unauthenticated" };

  // TODO(P6): build input from real DB skill_state via withAccount(); for now
  // we ground the report in the labelled sample data so the surface is real.
  const input = {
    learnerName: SAMPLE_LEARNER.name,
    skills: buildSampleSkills(),
    recent: SAMPLE_RECENT.map((r) => ({ title: r.title, stars: r.stars })),
  };

  try {
    const report = await generateProgressReport(input);
    return { ok: true, report, sample: true };
  } catch (error) {
    // The AI gateway/validation failed. Log non-critically and tell the client
    // it is unavailable; we never leak raw model output or a stack to the UI.
    captureNonCritical("parent progress report generation failed", error);
    return { ok: false, reason: "unavailable" };
  }
}
