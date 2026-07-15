// server-only: this module reads the DB through the account-scoped tutor store
// and must never be imported into a Client Component. (the `server-only`
// package isn't installed; this comment is the guard, and only the parent
// server components / actions import it.)
import { getSessionOrNull } from "@/lib/auth";
import { withUnlockedAccount } from "@/lib/parent-pin-gate";
import { getParentPinHash } from "@/lib/parent-pin-store";
import {
  getFluencyHistory,
  getLearnerSettings,
  getPendingCheckpointResults,
  getRecentAttempts,
  getSkillState,
  listGeneratedAttempts,
  listLearners,
  listEnrollmentsDetailed,
  skillOutcomeCounts,
  type LearnerRow,
  type PendingCheckpoint,
  type RecentAttempt,
} from "@/lib/tutor/store";
import { withOwnedLearner } from "@/lib/tutor/scope";
import { getLearnerInterests, listPublishedInterests, type InterestView } from "@/lib/interests/store";
import { getStarBalance, listStarLedger, type LedgerEntry } from "@/lib/rewards/store";
import type { LearnerSettings } from "@/lib/content/config";
import { deriveOutcome, isPlaced, type SkillState } from "@/lib/tutor/mastery";
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

/**
 * Read helpers for the parent surface, every account-scoped one protected by
 * `withUnlockedAccount` so a valid session cannot outlive the device PIN grace
 * window during a soft navigation. The
 * pages stay declarative; the DB shaping (skill_state -> per-strand outcomes,
 * attempts -> readable rows) lives here. Build-safe: nothing connects at module
 * top level; the gate resolves the session and opens the DB per-request.
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
  "math-clock": "Tell the time",
  "math-money": "Count money",
  "math-measure": "Measure & compare",
  "sort-categories": "Sort",
  "seq-order": "Order",
  "oral-reading": "Read aloud",
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
function relativeDay(day: string, today: Date = new Date()): string {
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

/**
 * Resolve an activity's display title across programs: try the supplied `program`
 * first (if any), then fall back to the owning program — attempts can span
 * programs (e.g. a World Languages activity surfaced on the core dashboard), so
 * the parent sees a real title, not the raw id. Falls back to the readable kind
 * label when no program defines the activity. Shared by toActivityRow (recent
 * activity) and the provenance trail.
 */
async function resolveActivityTitle(
  activityId: string,
  kind: string,
  program?: Program,
): Promise<string> {
  let found = program ? findActivity(program, activityId) : undefined;
  if (!found) {
    const owner = await findProgramByActivityIdAsync(activityId);
    found = owner ? findActivity(owner, activityId) : undefined;
  }
  return found?.activity.title ?? kindLabel(kind);
}

async function toActivityRow(program: Program | undefined, a: RecentAttempt): Promise<ActivityRow> {
  return {
    activityId: a.activityId,
    title: await resolveActivityTitle(a.activityId, a.kind, program),
    kindLabel: kindLabel(a.kind),
    stars: a.stars,
    day: a.day,
    when: relativeDay(a.day),
  };
}

/**
 * Build the {@link LearnerCard} list for an account: every learner with their
 * core-program outcome summary. Resolves the adaptive program + its skill tags
 * once, then tallies each learner's outcomes against them. Shared by the overview
 * and the learner list so the card shape is computed in exactly one place.
 */
async function buildLearnerCards(accountId: string): Promise<LearnerCard[]> {
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
}

/** The account's learners, each with an outcome summary, for the overview/list. */
export async function listLearnerCards(): Promise<LearnerCard[]> {
  return withUnlockedAccount(({ accountId }) => buildLearnerCards(accountId), {
    lockedFallback: () => [],
  });
}

/**
 * The Settings page read: the primary (first) learner's id plus their persisted
 * `LearnerSettings`. Account-scoped and unlock-gated in a single pass
 * so the form can initialize its toggles from what's actually stored — a parent
 * who turned the §8 AI kill-switch OFF must see it stay OFF across reloads, not
 * silently re-enabled from hardcoded defaults. Returns null settings when there
 * is no learner (nothing to persist) or the row has no stored settings yet.
 */
export interface PrimaryLearnerSettings {
  primaryLearnerId: string | null;
  settings: LearnerSettings | null;
}

export async function getPrimaryLearnerSettings(): Promise<PrimaryLearnerSettings> {
  return withUnlockedAccount(
    async ({ accountId }) => {
      const learners = await listLearners(accountId);
      const primary = learners[0];
      if (!primary) return { primaryLearnerId: null, settings: null };
      const settings = await getLearnerSettings(accountId, primary.id);
      return { primaryLearnerId: primary.id, settings };
    },
    { lockedFallback: () => ({ primaryLearnerId: null, settings: null }) },
  );
}

/**
 * The signed-in parent's email, for the account-delete typed-confirmation prompt
 * (P6) — the parent must type their own email to confirm. Resolved from the
 * Better Auth session per-request (lazy getAuth(), build-safe). Returns null
 * when there is no session (the gated page won't render in that case anyway).
 */
export async function getAccountEmail(): Promise<string | null> {
  return withUnlockedAccount(
    async () => (await getSessionOrNull())?.user?.email ?? null,
    { lockedFallback: () => null },
  );
}

/** Whether the unlocked account currently has a grown-up PIN configured. */
export async function getParentPinConfigured(): Promise<boolean> {
  return withUnlockedAccount(
    async ({ accountId }) => (await getParentPinHash(accountId)) !== null,
    { lockedFallback: () => false },
  );
}

/** The per-learner settings page read: the requested learner + their persisted
 *  settings. */
export interface LearnerSettingsForParent {
  learner: LearnerRow;
  settings: LearnerSettings | null;
}

/**
 * The per-learner Settings page read (P6): the REQUESTED learner (not the
 * primary) plus their persisted `LearnerSettings`, account-scoped. This is the
 * per-learner analog of {@link getPrimaryLearnerSettings} that closes the
 * multi-child gap — a parent with 2+ children can now see/edit each child's
 * §8 AI kill-switch, daily goal, and read-aloud default. Returns null when the
 * learner does not exist or is not this account's (the page turns that into a
 * 404), so the form is never bound to an unowned learner.
 */
export async function getLearnerSettingsForParent(
  learnerId: string,
): Promise<LearnerSettingsForParent | null> {
  return withUnlockedAccount(
    ({ accountId }) =>
      withOwnedLearner<LearnerSettingsForParent | null>(
        accountId,
        learnerId,
        async (learner) => {
          const settings = await getLearnerSettings(accountId, learner.id);
          return { learner, settings };
        },
        null,
      ),
    { lockedFallback: () => null },
  );
}

/** The per-learner Interests card read: the requested learner + the full
 *  published taxonomy + which ids the parent currently OFFERS. */
export interface LearnerInterestsForParent {
  learner: LearnerRow;
  allInterests: InterestView[];
  offeredIds: string[];
}

/**
 * The per-learner Interests card read (Task 9): every published interest (so
 * the parent can toggle any of them) plus which ones are currently offered for
 * this learner. Returns null when the learner does not exist or is not this
 * account's (the page turns that into a 404), matching
 * {@link getLearnerSettingsForParent}.
 */
export async function getLearnerInterestsForParent(
  learnerId: string,
): Promise<LearnerInterestsForParent | null> {
  return withUnlockedAccount(
    ({ accountId }) =>
      withOwnedLearner<LearnerInterestsForParent | null>(
        accountId,
        learnerId,
        async (learner) => {
          const [allInterests, { offered }] = await Promise.all([
            listPublishedInterests(),
            getLearnerInterests(accountId, learner.id),
          ]);
          return { learner, allInterests, offeredIds: offered.map((o) => o.id) };
        },
        null,
      ),
    { lockedFallback: () => null },
  );
}

/* ── Rewards (Adventure 2.0 Phase A / Task 10, spec §3.1) ─────────────────── */

/** Friendly copy per star-ledger reason code, for the parent Rewards panel. */
const REASON_LABEL: Record<string, string> = {
  activity_complete: "Finished an activity",
  quest_complete: "Completed a quest",
  sticker_purchase: "Got a sticker",
  adjustment: "Bonus from you",
};

/** Plain-language label for a star-ledger reason (falls back to the raw code).
 *  Not exported: only {@link getLearnerRewards} resolves it (into
 *  `RewardsLedgerRow.reasonLabel`) — mirrors `ACTIVITY_KIND_LABEL`'s private
 *  map, unlike the exported `kindLabel` (which other modules do call). */
function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

/** One ledger row the Rewards panel renders, enriched with friendly copy. */
export interface RewardsLedgerRow {
  delta: number;
  reason: string;
  reasonLabel: string;
  /** ISO timestamp — carried through only as a stable React list key. */
  createdAt: string;
  /** Friendly relative label ("Today", "Yesterday", "3 days ago", "Jun 2"). */
  when: string;
}

/** The per-learner Rewards panel read: current balance + the newest ledger page. */
export interface LearnerRewards {
  learner: LearnerRow;
  balance: number;
  ledger: RewardsLedgerRow[];
}

/**
 * The parent Rewards panel read (Task 10): the requested learner's star balance
 * plus their newest ~10 ledger entries, each enriched with friendly reason copy
 * and a relative date. Account-scoped and unlock-gated; returns null when the
 * learner does not exist or is not this account's (the page 404s), matching
 * {@link getLearnerSettingsForParent}.
 */
export async function getLearnerRewards(learnerId: string): Promise<LearnerRewards | null> {
  return withUnlockedAccount(
    ({ accountId }) =>
      withOwnedLearner<LearnerRewards | null>(
      accountId,
      learnerId,
      async (learner) => {
        const [balance, ledger] = await Promise.all([
          getStarBalance(accountId, learnerId),
          listStarLedger(accountId, learnerId, 10),
        ]);
        return {
          learner,
          balance,
          ledger: ledger.map((entry: LedgerEntry) => ({
            delta: entry.delta,
            reason: entry.reason,
            reasonLabel: reasonLabel(entry.reason),
            createdAt: entry.createdAt,
            when: relativeDay(entry.createdAt.slice(0, 10)),
          })),
        };
      },
      null,
      ),
    { lockedFallback: () => null },
  );
}

/** Parent-ready WCPM history, reduced to the best sentence-reading result per day. */
export interface FluencySeries {
  learner: LearnerRow;
  points: { day: string; wcpm: number; label: string }[];
  latest: number | null;
  best: number | null;
}

/**
 * Read and shape one owned learner's sentence-reading fluency history. The
 * nested ownership gate keeps the parent wrapper fail-closed before the store
 * reader runs; the store applies the same gate at its own boundary.
 */
export async function getLearnerFluency(learnerId: string): Promise<FluencySeries | null> {
  return withUnlockedAccount(
    ({ accountId }) =>
      withOwnedLearner<FluencySeries | null>(
      accountId,
      learnerId,
      async (learner) => {
        const history = await getFluencyHistory(accountId, learnerId);
        const bestByDay = new Map<string, number>();

        for (const point of history) {
          if (typeof point.wcpm !== "number" || !Number.isFinite(point.wcpm)) continue;
          const prior = bestByDay.get(point.day);
          if (prior === undefined || point.wcpm > prior) bestByDay.set(point.day, point.wcpm);
        }

        const points = [...bestByDay.entries()]
          .sort(([dayA], [dayB]) => dayA.localeCompare(dayB))
          .map(([day, wcpm]) => ({ day, wcpm, label: relativeDay(day) }));

        return {
          learner,
          points,
          latest: points.at(-1)?.wcpm ?? null,
          best: points.length > 0 ? Math.max(...points.map(({ wcpm }) => wcpm)) : null,
        };
      },
      null,
      ),
    { lockedFallback: () => null },
  );
}

/** One provenance row the "what the AI made" page renders. */
export interface ProvenanceRow {
  activityId: string;
  /** Resolved activity title (falls back to the readable kind label). */
  title: string;
  kindLabel: string;
  stars: number;
  model: string | null;
  route: string | null;
  /** Friendly "made on" date, or null when generatedAt wasn't recorded. */
  madeOn: string | null;
}

/** The provenance trail view for one learner (page + cursor for "load more"). */
export interface LearnerActivityTrail {
  learner: LearnerRow;
  rows: ProvenanceRow[];
  nextCursor: string | null;
}

/**
 * The per-learner provenance page read (P6 / spec §8 "parent-visible 'what the
 * AI made' trail"): the requested learner + a page of their AI-generated
 * attempts, each enriched with a readable activity title + a friendly date.
 * Account-scoped and unlock-gated; returns null when the learner isn't this
 * account's (the page 404s). Keyset-paginated via `cursor`.
 */
export async function getLearnerActivityTrail(
  learnerId: string,
  cursor?: string | null,
): Promise<LearnerActivityTrail | null> {
  return withUnlockedAccount(
    ({ accountId }) =>
      withOwnedLearner<LearnerActivityTrail | null>(
      accountId,
      learnerId,
      async (learner) => {
        const page = await listGeneratedAttempts(accountId, learnerId, { cursor });
        const rows: ProvenanceRow[] = await Promise.all(
          page.items.map(async (a) => ({
            activityId: a.activityId,
            title: await resolveActivityTitle(a.activityId, a.kind),
            kindLabel: kindLabel(a.kind),
            stars: a.stars,
            model: a.model,
            route: a.route,
            madeOn: a.generatedAt ? relativeDay(a.generatedAt.slice(0, 10)) : null,
          })),
        );
        return { learner, rows, nextCursor: page.nextCursor };
      },
      null,
      ),
    { lockedFallback: () => null },
  );
}

/** A single labelled skill_state row, in domain order, for the learner detail. */
export interface SkillStatus {
  slug: SkillTag;
  label: string;
  domain: string;
  readyIndicator: string;
  /** undefined = no evidence yet (renders as "Not started", never failure). */
  outcome: SkillOutcome | undefined;
  /** "baseline" when solid came (at least partly) from a parent-confirmed
   *  check-in rather than day-over-day play; "play" otherwise. Drives the
   *  honest "placed" marker on the skill pill — placed is never shown as
   *  "mastered" (Adventure 2.0 C1, spec §3.5). */
  source?: "play" | "baseline";
}

/** One {@link PendingCheckpoint} enriched with the friendly labels the
 *  "Check-in results" panel renders — mirrors how {@link ActivityRow} /
 *  {@link ProvenanceRow} wrap their raw store rows. */
export interface CheckpointForParent extends PendingCheckpoint {
  /** The checkpoint's unit resolved to its authored title (falls back to the
   *  raw unit id if the unit can't be found in the current program tree). */
  unitTitle: string;
  /** Friendly relative label for when the check-in was taken ("Today", …). */
  when: string;
}

/** Everything the learner-detail page needs, resolved and account-scoped. */
export interface LearnerDetail {
  learner: LearnerRow;
  program: Program | undefined;
  skills: SkillStatus[];
  recent: ActivityRow[];
  /** True when the learner has completed no activities yet (honest empty state). */
  hasActivity: boolean;
  /** This learner's baseline check-in history, newest first (Adventure 2.0 C1). */
  checkpoints: CheckpointForParent[];
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
  return withUnlockedAccount(
    ({ accountId }) =>
      withOwnedLearner<LearnerDetail | null>(
      accountId,
      learnerId,
      async (learner) => {
        const program = await getProgramAsync(ADAPTIVE_PROGRAM_SLUG);
        const [state, attempts, checkpoints] = await Promise.all([
          getSkillState(accountId, learnerId),
          getRecentAttempts(accountId, learnerId, 12),
          getPendingCheckpointResults(accountId, learnerId),
        ]);

        const skills: SkillStatus[] = SKILLS.map((skill) => ({
          slug: skill.slug,
          label: skill.label,
          domain: skill.domain,
          readyIndicator: skill.readyIndicator,
          outcome: outcomeFor(state, skill.slug),
          source: isPlaced(state[skill.slug]) ? "baseline" : "play",
        }));

        return {
          learner,
          program,
          skills,
          recent: await Promise.all(attempts.map((a) => toActivityRow(program, a))),
          hasActivity: attempts.length > 0,
          checkpoints: checkpoints.map((c) => ({
            ...c,
            unitTitle: program?.units.find((u) => u.id === c.unitId)?.title ?? c.unitId,
            when: relativeDay(c.createdAt.slice(0, 10)),
          })),
        };
      },
      null,
      ),
    { lockedFallback: () => null },
  );
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
  return withUnlockedAccount(
    async ({ accountId }) => {
      const cards = await buildLearnerCards(accountId);
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
    },
    { lockedFallback: () => ({ learners: [], primary: null }) },
  );
}

/** Map a learner's display name into the initial used for the avatar tile. */
export function avatarInitial(displayName: string): string {
  return displayName.trim().charAt(0).toUpperCase() || "?";
}

/* ── Curriculum read helper ────────────────────────────────────────────────── */

// EnrolledProgramView is the canonical shape shared with the client via
// @/lib/parent-views; consumers import it from there directly.

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
 * Resolve the unlock-gated curriculum view for one account-owned learner.
 * Returns empty lists when the learner does not exist or is not this account's.
 */
export async function getLearnerCurriculum(learnerId: string): Promise<LearnerCurriculum> {
  return withUnlockedAccount(
    async ({ accountId }) => {
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
    },
    { lockedFallback: () => ({ enrolled: [], available: [] }) },
  );
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
interface UnitSummary {
  key: string;
  title: string;
  emoji?: string;
}

/**
 * A skill entry for the program-detail page (label + domain, deduped).
 */
interface ProgramSkillEntry {
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
 * Resolve a program-detail view. Account-scoped and unlock-gated so each learner's
 * enrollment status is scoped to the signed-in parent. Returns null when the
 * program does not exist (page should 404).
 */
async function buildProgramDetail(accountId: string, slug: string): Promise<ProgramDetail | null> {
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
  const learnerRows = await listLearners(accountId);
  const learners = await Promise.all(
    learnerRows.map(async (learner) => {
      const enrollments = await listEnrollmentsDetailed(accountId, learner.id);
      const enrollment = enrollments.find((e) => e.slug === slug);
      const status: EnrollmentStatus | "none" = enrollment ? enrollment.status : "none";
      return { id: learner.id, displayName: learner.displayName, status };
    }),
  );

  return { summary, units, skills, stats, learners };
}

export async function getProgramDetail(slug: string): Promise<ProgramDetail | null> {
  return withUnlockedAccount(
    ({ accountId }) => buildProgramDetail(accountId, slug),
    { lockedFallback: () => null },
  );
}
