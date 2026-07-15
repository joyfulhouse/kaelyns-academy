// Server-only: this registry may claim DB witnesses and must never be imported
// by a Client Component. It intentionally has one key, not a general plugin API.
import type { ActivityKind, OralReadingConfig } from "@/content/activity-configs";
import { oralReadingConfig } from "@/content/activity-configs";
import type { ActivityScore, SkillTag } from "@/content/types";
import {
  recordOralReadingAttempt,
  type OralReadingWitnessFacts,
} from "@/lib/tutor/store";
import type { DayKey } from "@/lib/tutor/mastery";
import type { OralReadingResponse } from "./oral-reading/logic";
import { parseAndScoreActivity } from "./server-verification";

export interface ServerAttemptVerifierInput {
  accountId: string;
  learnerId: string;
  programSlug: string;
  expectedProgramVersionId: string | null;
  completionId: string;
  unitKey: string;
  activityId: string;
  verificationId?: string;
  rawConfig: unknown;
  allowedSkillTags: readonly SkillTag[];
  day: DayKey;
  checkpointPhase?: "baseline" | "mid" | "final" | null;
}

export type ServerAttemptVerifier = (
  input: ServerAttemptVerifierInput,
) => Promise<ActivityScore | null>;

function sentenceWordCount(passage: string): number {
  const trimmed = passage.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Convert only server-stored facts to the ordinary bounded response contract. */
export function canonicalOralReadingResponse(
  config: OralReadingConfig,
  witness: OralReadingWitnessFacts | null,
): OralReadingResponse | null {
  if (!witness) {
    return { attempts: 0, results: [], status: "participated-unverified" };
  }

  const configMode = config.mode === "sentence" ? "sentence" : "word";
  if (witness.mode !== configMode) return null;
  if (config.mode !== "sentence") {
    if (
      witness.totalWords !== 1 ||
      witness.perWord !== null ||
      witness.wcpm !== null ||
      witness.correctCount < 0 ||
      witness.correctCount > 1 ||
      ((witness.result === "matched") !== (witness.correctCount === 1))
    ) {
      return null;
    }
    return { attempts: 1, results: [witness.result], status: "verified" };
  }

  const expectedWords = sentenceWordCount(config.passage);
  if (
    witness.result === "no-speech" ||
    !witness.perWord ||
    witness.totalWords !== expectedWords ||
    witness.perWord.length !== expectedWords ||
    witness.correctCount !==
      witness.perWord.filter(({ state }) => state === "correct").length ||
    ((witness.result === "matched") !== (witness.correctCount === expectedWords)) ||
    (witness.wcpm !== null &&
      (!Number.isInteger(witness.wcpm) || witness.wcpm < 0 || witness.wcpm > 300))
  ) {
    return null;
  }
  return {
    attempts: 1,
    results: [witness.result],
    status: "verified",
    perWord: witness.perWord,
    correctCount: witness.correctCount,
    totalWords: witness.totalWords,
    ...(witness.wcpm === null ? {} : { wcpm: witness.wcpm }),
  };
}

const verifyOralReading: ServerAttemptVerifier = async (input) => {
  const config = oralReadingConfig.safeParse(input.rawConfig);
  if (!config.success) return null;

  return recordOralReadingAttempt(input.accountId, {
    learnerId: input.learnerId,
    programSlug: input.programSlug,
    expectedProgramVersionId: input.expectedProgramVersionId,
    completionId: input.completionId,
    unitKey: input.unitKey,
    activityId: input.activityId,
    verificationId: input.verificationId,
    day: input.day,
    checkpointPhase: input.checkpointPhase,
    canonicalize: (witness) => {
      const response = canonicalOralReadingResponse(config.data, witness);
      if (!response) return null;
      const canonical = parseAndScoreActivity(
        "oral-reading",
        config.data,
        response,
        input.allowedSkillTags,
      );
      return canonical.ok
        ? { response: canonical.response, score: canonical.score }
        : null;
    },
  });
};

const SERVER_VERIFIERS = {
  "oral-reading": verifyOralReading,
} satisfies Partial<Record<ActivityKind, ServerAttemptVerifier>>;

export function getServerAttemptVerifier(kind: ActivityKind): ServerAttemptVerifier | undefined {
  return (SERVER_VERIFIERS as Partial<Record<ActivityKind, ServerAttemptVerifier>>)[kind];
}

export function serverVerifierKinds(): ActivityKind[] {
  return Object.keys(SERVER_VERIFIERS) as ActivityKind[];
}
