// server-only: this module reads the DB through the account-scoped tutor store
// and must never be imported into a Client Component. (the `server-only`
// package isn't installed; this comment is the guard, and only the parent
// server components / actions import it.)
import { withAccount } from "@/lib/tenancy";
import {
  getLearner,
  getRecentAttempts,
  getSkillState,
  listLearners,
  skillOutcomeCounts,
  type LearnerRow,
  type RecentAttempt,
} from "@/lib/tutor/store";
import { deriveOutcome, type SkillState } from "@/lib/tutor/mastery";
import {
  SKILLS,
  findActivity,
  getProgram,
  type ActivityKind,
  type Program,
  type SkillOutcome,
  type SkillTag,
} from "@/content";

/**
 * Read helpers for the parent surface, every one scoped through `withAccount`
 * (the tenancy seam) so a parent only ever sees their own account's data. The
 * pages stay declarative; the DB shaping (skill_state -> per-strand outcomes,
 * attempts -> readable rows) lives here. Build-safe: nothing connects at module
 * top level; `withAccount` resolves the session and opens the DB per-request.
 */

/** The program every learner is enrolled in today (see ensureEnrollment). */
export const ADAPTIVE_PROGRAM_SLUG = "kaelyn-adaptive";

/** All skill slugs we track, in the curriculum's authored order. */
const ALL_SKILL_TAGS: SkillTag[] = SKILLS.map((s) => s.slug);

/**
 * Parent-readable label per activity kind, mirroring each plugin's `label`
 * (src/activities/<kind>/index.ts). Kept as a static map so the parent RSC tree
 * never imports the activity Players (client components) just to read a noun.
 */
const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  "phonics-wordbuild": "Build a word",
  "sightword-game": "Word hunt",
  "math-tenframe": "Ten-frame",
  "journal-prompt": "Draw & write",
  "reading-comprehension": "Read & answer",
  "math-array": "Array builder",
};

/** Plain-language label for an attempt's kind (falls back to the raw kind). */
export function kindLabel(kind: string): string {
  return ACTIVITY_KIND_LABEL[kind as ActivityKind] ?? kind;
}

/** A skill_state outcome tally plus its total, for a calm summary. */
export interface OutcomeSummary {
  counts: Record<SkillOutcome, number>;
  /** Skills with any evidence at all (solid + emerging). */
  active: number;
  /** Total skills considered. */
  total: number;
}

function summarize(counts: Record<SkillOutcome, number>, total: number): OutcomeSummary {
  return { counts, active: counts.solid + counts.emerging, total };
}

/** One learner plus a lightweight progress summary, for the overview + list. */
export interface LearnerCard {
  learner: LearnerRow;
  program: Program | undefined;
  summary: OutcomeSummary;
}

/**
 * Friendly relative label for a YYYY-MM-DD day, computed against today on the
 * server. "Today" / "Yesterday" for the recent past, otherwise a short date.
 * Returns the raw string if it does not parse (defensive; never throws).
 */
export function relativeDay(day: string, today: Date = new Date()): string {
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfToday.getTime() - parsed.getTime()) / msPerDay);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Map a {@link RecentAttempt} to the row the parent surface renders. */
export interface ActivityRow {
  activityId: string;
  title: string;
  kindLabel: string;
  stars: number;
  /** Raw YYYY-MM-DD day the attempt was recorded. */
  day: string;
  /** Friendly relative label ("Today", "Yesterday", "3 days ago", "Jun 2"). */
  when: string;
}

function toActivityRow(program: Program | undefined, a: RecentAttempt): ActivityRow {
  const found = program ? findActivity(program, a.activityId) : undefined;
  return {
    activityId: a.activityId,
    title: found?.activity.title ?? a.activityId,
    kindLabel: kindLabel(a.kind),
    stars: a.stars,
    day: a.day,
    when: relativeDay(a.day),
  };
}

/** The account's learners, each with an outcome summary, for the overview/list. */
export async function listLearnerCards(): Promise<LearnerCard[]> {
  return withAccount(async ({ accountId }) => {
    const learners = await listLearners(accountId);
    const program = getProgram(ADAPTIVE_PROGRAM_SLUG);
    return Promise.all(
      learners.map(async (learner) => {
        const counts = await skillOutcomeCounts(accountId, learner.id, ALL_SKILL_TAGS);
        return { learner, program, summary: summarize(counts, ALL_SKILL_TAGS.length) };
      }),
    );
  });
}

/** A single labelled skill_state row, in domain order, for the learner detail. */
export interface SkillStatus {
  slug: SkillTag;
  label: string;
  domain: string;
  readyIndicator: string;
  /** undefined = no evidence yet (renders as "Not started", never failure). */
  outcome: SkillOutcome | undefined;
}

/** Everything the learner-detail page needs, resolved and account-scoped. */
export interface LearnerDetail {
  learner: LearnerRow;
  program: Program | undefined;
  skills: SkillStatus[];
  recent: ActivityRow[];
  /** True when the learner has completed no activities yet (honest empty state). */
  hasActivity: boolean;
}

/** Current outcome for a skill from its DB history (not_yet / emerging / solid). */
function outcomeFor(state: SkillState, slug: SkillTag): SkillOutcome | undefined {
  const record = state[slug];
  if (!record || record.history.length === 0) return undefined;
  return deriveOutcome(record);
}

/**
 * Resolve a learner the account owns plus their real skill map and recent
 * activity. Returns null when the learner does not exist or is not this
 * account's (the page turns that into a 404).
 */
export async function getLearnerDetail(learnerId: string): Promise<LearnerDetail | null> {
  return withAccount(async ({ accountId }) => {
    const learner = await getLearner(accountId, learnerId);
    if (!learner) return null;

    const program = getProgram(ADAPTIVE_PROGRAM_SLUG);
    const [state, attempts] = await Promise.all([
      getSkillState(accountId, learnerId),
      getRecentAttempts(accountId, learnerId, 12),
    ]);

    const skills: SkillStatus[] = SKILLS.map((skill) => ({
      slug: skill.slug,
      label: skill.label,
      domain: skill.domain,
      readyIndicator: skill.readyIndicator,
      outcome: outcomeFor(state, skill.slug),
    }));

    return {
      learner,
      program,
      skills,
      recent: attempts.map((a) => toActivityRow(program, a)),
      hasActivity: attempts.length > 0,
    };
  });
}

/** The overview's "first learner" view: their summary + recent activity. */
export interface OverviewData {
  learners: LearnerCard[];
  primary:
    | { learner: LearnerRow; program: Program | undefined; summary: OutcomeSummary; recent: ActivityRow[]; hasActivity: boolean }
    | null;
}

/**
 * The parent home reads: the full learner list (for the count + summary) and,
 * for the first learner, their recent activity. One pass, account-scoped.
 */
export async function getOverview(): Promise<OverviewData> {
  return withAccount(async ({ accountId }) => {
    const learners = await listLearners(accountId);
    const program = getProgram(ADAPTIVE_PROGRAM_SLUG);

    const cards: LearnerCard[] = await Promise.all(
      learners.map(async (learner) => {
        const counts = await skillOutcomeCounts(accountId, learner.id, ALL_SKILL_TAGS);
        return { learner, program, summary: summarize(counts, ALL_SKILL_TAGS.length) };
      }),
    );

    const first = cards[0];
    if (!first) return { learners: cards, primary: null };

    const attempts = await getRecentAttempts(accountId, first.learner.id, 6);
    return {
      learners: cards,
      primary: {
        learner: first.learner,
        program: first.program,
        summary: first.summary,
        recent: attempts.map((a) => toActivityRow(first.program, a)),
        hasActivity: attempts.length > 0,
      },
    };
  });
}

/** Map a learner's display name into the initial used for the avatar tile. */
export function avatarInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}
