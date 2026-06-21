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
  listEnrollmentsDetailed,
  skillOutcomeCounts,
  type LearnerRow,
  type RecentAttempt,
} from "@/lib/tutor/store";
import { deriveOutcome, type SkillState } from "@/lib/tutor/mastery";
import {
  SKILLS,
  findActivity,
  getSkill,
  programStats,
  skillTagsForProgram,
  type ActivityKind,
  type Program,
  type SkillOutcome,
  type SkillTag,
} from "@/content";
import {
  getProgramAsync,
  findProgramByActivityIdAsync,
  listProgramSummariesAsync,
  type ProgramSummary,
} from "@/lib/content/repository";
import type { EnrollmentConfig } from "@/lib/content/config";
import type { EnrollmentStatus } from "@/lib/tutor/enrollment";
import type { EnrolledProgramView } from "@/lib/parent-views";
export type { EnrolledProgramView } from "@/lib/parent-views";

/**
 * Read helpers for the parent surface, every one scoped through `withAccount`
 * (the tenancy seam) so a parent only ever sees their own account's data. The
 * pages stay declarative; the DB shaping (skill_state -> per-strand outcomes,
 * attempts -> readable rows) lives here. Build-safe: nothing connects at module
 * top level; `withAccount` resolves the session and opens the DB per-request.
 */

/** The core program every learner is enrolled in by default (see ensureEnrollment). */
export const ADAPTIVE_PROGRAM_SLUG = "kaelyn-adaptive";

/**
 * The skill tags the parent overview's "% solid" summary is scoped to. With more
 * than one program now in the registry (e.g. world-languages), counting *all*
 * SKILLS would dilute the core program's number with language strands the
 * learner may not have touched. So the dashboard summary scopes to the core
 * program's skills; the learner-detail page still renders every domain (incl.
 * the language strands) in its own labelled section.
 *
 * Resolved per-request (DB-preferred, static-fallback) rather than at module
 * top level, so the build stays safe and the value reflects the live catalog.
 */
async function adaptiveSkillTags(): Promise<SkillTag[]> {
  const p = await getProgramAsync(ADAPTIVE_PROGRAM_SLUG);
  return p ? skillTagsForProgram(p) : SKILLS.map((s) => s.slug);
}

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
  "lang-symbol-intro": "Meet the symbols",
  "lang-listen-match": "Listen & find",
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

async function toActivityRow(program: Program | undefined, a: RecentAttempt): Promise<ActivityRow> {
  let found = program ? findActivity(program, a.activityId) : undefined;
  if (!found) {
    // Attempts can span programs (e.g. a World Languages activity shown on the
    // core dashboard) — resolve the owning program so the parent sees a real
    // title, not the raw id.
    const owner = await findProgramByActivityIdAsync(a.activityId);
    found = owner ? findActivity(owner, a.activityId) : undefined;
  }
  return {
    activityId: a.activityId,
    title: found?.activity.title ?? kindLabel(a.kind),
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
    const [program, adaptiveTags] = await Promise.all([
      getProgramAsync(ADAPTIVE_PROGRAM_SLUG),
      adaptiveSkillTags(),
    ]);
    return Promise.all(
      learners.map(async (learner) => {
        const counts = await skillOutcomeCounts(accountId, learner.id, adaptiveTags);
        return { learner, program, summary: summarize(counts, adaptiveTags.length) };
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

    const program = await getProgramAsync(ADAPTIVE_PROGRAM_SLUG);
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
      recent: await Promise.all(attempts.map((a) => toActivityRow(program, a))),
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
    const [program, adaptiveTags] = await Promise.all([
      getProgramAsync(ADAPTIVE_PROGRAM_SLUG),
      adaptiveSkillTags(),
    ]);

    const cards: LearnerCard[] = await Promise.all(
      learners.map(async (learner) => {
        const counts = await skillOutcomeCounts(accountId, learner.id, adaptiveTags);
        return { learner, program, summary: summarize(counts, adaptiveTags.length) };
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
        recent: await Promise.all(attempts.map((a) => toActivityRow(first.program, a))),
        hasActivity: attempts.length > 0,
      },
    };
  });
}

/** Map a learner's display name into the initial used for the avatar tile. */
export function avatarInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

/* ── Curriculum read helper ────────────────────────────────────────────────── */

// EnrolledProgramView is the canonical shape shared with the client via
// @/lib/parent-views (re-exported at the top of this file so callers can
// import it from either location).

/** The two lists the CurriculumPanel renders. */
export interface LearnerCurriculum {
  enrolled: EnrolledProgramView[];
  /**
   * Published programs not currently active or paused for this learner —
   * the "add a program" catalog. Removed programs are excluded so restoring
   * goes through the enrolled list, not the add control.
   */
  available: ProgramSummary[];
}

/**
 * Resolve the curriculum view for one learner. Account-scoped (withAccount).
 * Returns empty lists when the learner does not exist or is not this account's.
 */
export async function getLearnerCurriculum(learnerId: string): Promise<LearnerCurriculum> {
  return withAccount(async ({ accountId }) => {
    const enrollments = await listEnrollmentsDetailed(accountId, learnerId);

    // Resolve each enrollment's program tree for its title + units.
    const enrolled: EnrolledProgramView[] = await Promise.all(
      enrollments.map(async (e) => {
        const program = await getProgramAsync(e.slug);
        const title = program?.title ?? e.slug;
        const units: { key: string; title: string }[] = program
          ? program.units.map((u) => ({ key: u.id, title: u.title }))
          : [];
        return { slug: e.slug, status: e.status, config: e.config, title, units };
      }),
    );

    // "Available" = published programs the learner is NOT actively/paused enrolled in.
    // Removed-status enrollments are already in the enrolled list; exclude active/paused slugs
    // from the catalog so the parent can't double-assign.
    const activeSlugs = new Set(
      enrolled
        .filter((e) => e.status === "active" || e.status === "paused")
        .map((e) => e.slug),
    );
    const allSummaries = await listProgramSummariesAsync();
    const available = allSummaries.filter((s) => !activeSlugs.has(s.slug));

    return { enrolled, available };
  });
}

/* ── Marketplace catalog read helpers ─────────────────────────────────────── */

/**
 * A catalog entry: the light summary plus computed stats derived from the full
 * program tree. We resolve the full program per slug to run programStats; the
 * cost is proportional to the number of published programs.
 */
export interface CatalogProgram extends ProgramSummary {
  stats: { units: number; lessons: number; activities: number };
}

/**
 * All published programs as catalog cards, each annotated with counts derived
 * from their full program tree. No account scope — this is a public-ish catalog
 * (the auth gate is on the parent route, not here).
 */
export async function getCatalog(): Promise<CatalogProgram[]> {
  const summaries = await listProgramSummariesAsync();
  return Promise.all(
    summaries.map(async (s) => {
      const program = await getProgramAsync(s.slug);
      const stats = program
        ? programStats(program)
        : { units: 0, lessons: 0, activities: 0 };
      return { ...s, stats };
    }),
  );
}

/**
 * A learner annotated with their current enrollment status for one program
 * slug. Used on the program-detail page's assign control.
 */
export interface LearnerWithStatus {
  id: string;
  displayName: string;
  /** "none" when the learner has never been enrolled, or the enrollment status. */
  status: EnrollmentStatus | "none";
}

/**
 * A unit summary derived from the full program tree.
 */
export interface UnitSummary {
  key: string;
  title: string;
  emoji?: string;
}

/**
 * A skill entry for the program-detail page (label + domain, deduped).
 */
export interface ProgramSkillEntry {
  label: string;
  domain: string;
}

/**
 * Everything the program-detail page needs: program metadata, computed counts,
 * unit/skill lists, and each account learner annotated with their status.
 */
export interface ProgramDetail {
  summary: ProgramSummary;
  units: UnitSummary[];
  skills: ProgramSkillEntry[];
  stats: { units: number; lessons: number; activities: number };
  learners: LearnerWithStatus[];
}

/**
 * Resolve a program-detail view. Account-scoped (withAccount) so each learner's
 * enrollment status is scoped to the signed-in parent. Returns null when the
 * program does not exist (page should 404).
 */
export async function getProgramDetail(slug: string): Promise<ProgramDetail | null> {
  const program = await getProgramAsync(slug);
  if (!program) return null;

  // Summary: derive from the static fallback shape if not in DB summaries.
  const allSummaries = await listProgramSummariesAsync();
  const summary: ProgramSummary = allSummaries.find((s) => s.slug === slug) ?? {
    slug: program.slug,
    title: program.title,
    subtitle: program.subtitle ?? null,
    ageBand: program.ageBand ?? null,
    summary: program.summary ?? null,
    world: null,
    languages: [],
  };

  // Units: ordered from the program tree, carrying the emoji if present.
  const units: UnitSummary[] = program.units.map((u) => ({
    key: u.id,
    title: u.title,
    emoji: u.emoji,
  }));

  // Skills: unique (label, domain) pairs from the program's skill tags, in
  // SKILLS rubric order (getSkill preserves that ordering).
  const seenLabels = new Set<string>();
  const skills: ProgramSkillEntry[] = [];
  for (const tag of skillTagsForProgram(program)) {
    const skill = getSkill(tag);
    if (skill && !seenLabels.has(skill.label)) {
      seenLabels.add(skill.label);
      skills.push({ label: skill.label, domain: skill.domain });
    }
  }

  const stats = programStats(program);

  // Learners: account's children, each with their enrollment status for this slug.
  const learners = await withAccount(async ({ accountId }) => {
    const learnerRows = await listLearners(accountId);
    return Promise.all(
      learnerRows.map(async (learner) => {
        const enrollments = await listEnrollmentsDetailed(accountId, learner.id);
        const enrollment = enrollments.find((e) => e.slug === slug);
        const status: EnrollmentStatus | "none" = enrollment ? enrollment.status : "none";
        return { id: learner.id, displayName: learner.displayName, status };
      }),
    );
  });

  return { summary, units, skills, stats, learners };
}
