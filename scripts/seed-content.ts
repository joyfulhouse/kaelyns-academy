/**
 * Seed script — Slice 1 content schema.
 *
 * buildSeedPlan: PURE transform (no DB, no side effects). Returns row value-sets
 * with intra-plan `key` strings linking parent→child. Real UUIDs are assigned
 * at insert time by seedContent().
 *
 * seedContent: thin DB glue, CLI-guarded. Call only from the command line:
 *   bun scripts/seed-content.ts
 * NEVER imported for DB side-effects at module load.
 */

import type { Program, Skill } from "@/content/types";

// ── Intra-plan key helpers ────────────────────────────────────────────────────

/** A zero-padded order string sortable lexicographically. Slice 5 will swap in
 *  fractional indexing; for now, authored array position is the order. */
function orderKey(position: number): string {
  return String(position).padStart(6, "0");
}

/** Derive locale + languages for a program version.
 *  For world-languages we surface the per-unit language codes. For all other
 *  programs the locale is en-US and the languages list is ["en-US"]. */
function deriveLocaleAndLanguages(
  program: Program,
): { locale: string; languages: string[] } {
  if (program.slug === "world-languages") {
    // Each unit id is the language key (zhuyin, spanish, japanese, korean).
    // Map to BCP-47 codes where possible; fall back to the id itself.
    const langMap: Record<string, string> = {
      zhuyin: "zh-TW",
      spanish: "es",
      japanese: "ja",
      korean: "ko",
    };
    const languages = program.units
      .map((u) => langMap[u.id] ?? u.id)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return { locale: "mul", languages };
  }
  return { locale: "en-US", languages: ["en-US"] };
}

/**
 * PURE. Return the first `activityKey` (== authored `activity.id`) that repeats
 * program-wide across all the program's lessons/units, or null when every
 * activity id is unique. Mirrors the runtime invariant `findDuplicateKeys`
 * enforces in the admin save path: since Fix-E Layer 1 makes `activity.id` the
 * authored key and `findActivity` returns the FIRST program-wide match, a
 * duplicate would make a seeded activity unreachable and break attempt-keying.
 * The seed must fail loudly on such a program rather than silently upserting it.
 */
export function findDuplicateProgramActivityKey(program: Program): string | null {
  const seen = new Set<string>();
  for (const unit of program.units) {
    for (const lesson of unit.lessons) {
      for (const activity of lesson.activities) {
        if (seen.has(activity.id)) return activity.id;
        seen.add(activity.id);
      }
    }
  }
  return null;
}

// ── Row value shapes (intra-plan keys, not DB UUIDs) ─────────────────────────

interface PublisherRow {
  key: string; // intra-plan dedup key = name
  name: string;
  kind: string;
}

interface ProgramRow {
  key: string;
  slug: string;
  status: string;
  publisherKey: string;
}

interface VersionRow {
  key: string;
  programKey: string;
  version: number;
  status: string;
  title: string;
  subtitle?: string;
  ageBand?: string;
  summary?: string;
  world?: string;
  locale: string;
  languages: string[];
}

interface UnitRow {
  key: string;
  programVersionKey: string;
  unitKey: string;
  orderKey: string;
  title: string;
  emoji?: string;
  world: string;
  bigIdea?: string;
  phonicsFocus?: string;
  mathFocus?: string;
  project?: string;
  checkpoint?: string;
  branchKey?: string;
}

interface LessonRow {
  key: string;
  unitKey: string;
  lessonKey: string;
  orderKey: string;
  title: string;
}

interface ActivityRow {
  key: string;
  lessonKey: string;
  activityKey: string;
  orderKey: string;
  kind: string;
  title: string;
  blurb?: string;
  estMinutes?: number;
  band: string;
  skillTags: string[];
  standardTags: string[];
  config: unknown;
}

interface SkillRow {
  slug: string;
  domain: string;
  label: string;
  readyIndicator: string;
  stretchIndicator?: string;
}

export interface SeedPlan {
  publishers: PublisherRow[];
  programs: ProgramRow[];
  versions: VersionRow[];
  units: UnitRow[];
  lessons: LessonRow[];
  activities: ActivityRow[];
  skills: SkillRow[];
}

// ── buildSeedPlan ─────────────────────────────────────────────────────────────

export function buildSeedPlan(programs: Program[], skills: Skill[]): SeedPlan {
  const publisherMap = new Map<string, PublisherRow>();
  const programRows: ProgramRow[] = [];
  const versionRows: VersionRow[] = [];
  const unitRows: UnitRow[] = [];
  const lessonRows: LessonRow[] = [];
  const activityRows: ActivityRow[] = [];

  for (const prog of programs) {
    // Fail loudly on a program-wide duplicate activityKey BEFORE building any
    // rows (Fix-E Layer 1: activity.id == activityKey must be globally unique
    // within a version for routing/gate/attempt-keying to be sound).
    const dupKey = findDuplicateProgramActivityKey(prog);
    if (dupKey !== null) {
      throw new Error(
        `Program "${prog.slug}" has a duplicate program-wide activityKey: "${dupKey}". ` +
          `Activity ids must be unique across the whole program (not just per lesson).`,
      );
    }

    // Publisher — builtin, deduplicated by name
    const publisherName = "Kaelyn's Academy";
    if (!publisherMap.has(publisherName)) {
      publisherMap.set(publisherName, {
        key: publisherName,
        name: publisherName,
        kind: "builtin",
      });
    }

    const programKey = prog.slug;
    const versionKey = `${prog.slug}@v1`;
    const { locale, languages } = deriveLocaleAndLanguages(prog);

    programRows.push({
      key: programKey,
      slug: prog.slug,
      status: "published",
      publisherKey: publisherName,
    });

    versionRows.push({
      key: versionKey,
      programKey,
      version: 1,
      status: "published",
      title: prog.title,
      subtitle: prog.subtitle,
      ageBand: prog.ageBand,
      summary: prog.summary,
      world: undefined,
      locale,
      languages,
    });

    for (const [uIdx, u] of prog.units.entries()) {
      const unitRowKey = `${versionKey}:unit:${u.id}`;
      unitRows.push({
        key: unitRowKey,
        programVersionKey: versionKey,
        unitKey: u.id,
        orderKey: orderKey(uIdx),
        title: u.title,
        emoji: u.emoji,
        world: u.world,
        bigIdea: u.bigIdea,
        phonicsFocus: u.phonicsFocus,
        mathFocus: u.mathFocus,
        project: u.project,
        checkpoint: u.checkpoint,
        branchKey: u.branchKey,
      });

      for (const [lIdx, l] of u.lessons.entries()) {
        const lessonRowKey = `${unitRowKey}:lesson:${l.id}`;
        lessonRows.push({
          key: lessonRowKey,
          unitKey: unitRowKey,
          lessonKey: l.id,
          orderKey: orderKey(lIdx),
          title: l.title,
        });

        for (const [aIdx, a] of l.activities.entries()) {
          activityRows.push({
            key: `${lessonRowKey}:activity:${a.id}`,
            lessonKey: lessonRowKey,
            activityKey: a.id,
            orderKey: orderKey(aIdx),
            kind: a.kind,
            title: a.title,
            blurb: a.blurb,
            estMinutes: a.estMinutes,
            band: a.band,
            skillTags: a.skillTags,
            standardTags: a.standardTags ?? [],
            config: a.config,
          });
        }
      }
    }
  }

  const skillRows: SkillRow[] = skills.map((s) => ({
    slug: s.slug,
    domain: s.domain,
    label: s.label,
    readyIndicator: s.readyIndicator,
    stretchIndicator: s.stretchIndicator,
  }));

  return {
    publishers: Array.from(publisherMap.values()),
    programs: programRows,
    versions: versionRows,
    units: unitRows,
    lessons: lessonRows,
    activities: activityRows,
    skills: skillRows,
  };
}

// ── seedContent ───────────────────────────────────────────────────────────────
// DB glue: inserts the plan into the database. CLI-guarded so this function is
// never called at module load (build-safety).
//
// Idempotent + transactional: the whole seed runs in ONE transaction (a partial
// failure rolls back, never leaving dangling refs), and every insert is an
// upsert-with-RETURNING keyed on the row's natural-key unique constraint — so a
// conflicting (already-seeded) row is still returned, yielding its REAL id. This
// matters because the prior version generated fresh UUIDs + onConflictDoNothing
// without read-back: on a re-run the in-memory id map pointed at phantom UUIDs
// that were never persisted, so dependent inserts (and publishedVersionId)
// referenced non-existent parents. Returning the actual row id — and refreshing
// content fields in the conflict's SET — makes a second run converge to the same
// published state with no dangling refs.

async function seedContent(): Promise<void> {
  // Lazy import keeps getDb() off the module top-level.
  const { getDb } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const { listPrograms, SKILLS } = await import("@/content");
  const { eq } = await import("drizzle-orm");

  const db = getDb();
  const plan = buildSeedPlan(listPrograms(), SKILLS);

  // Intra-plan key → REAL persisted DB id (read back via RETURNING, never a
  // phantom UUID). Each insert uses onConflictDoUpdate so a conflicting (already
  // seeded) row is still RETURNED — giving us its real id in one statement and
  // converging its content fields to the current static source on a re-run.
  const ids = new Map<string, string>();
  const newId = () => globalThis.crypto.randomUUID();

  /** First returned id, or a clear error (an upsert+returning must yield a row). */
  function firstId(rows: { id: string }[], what: string): string {
    if (!rows[0]?.id) throw new Error(`seed: ${what} upsert returned no row`);
    return rows[0].id;
  }

  await db.transaction(async (tx) => {
    // Publishers — no DB unique key on name, so dedup by select-first (avoids
    // inserting a duplicate publisher row on a re-run).
    for (const p of plan.publishers) {
      const existing = await tx
        .select({ id: schema.publisher.id })
        .from(schema.publisher)
        .where(eq(schema.publisher.name, p.name))
        .limit(1);
      if (existing[0]?.id) {
        ids.set(p.key, existing[0].id);
      } else {
        const inserted = await tx
          .insert(schema.publisher)
          .values({ id: newId(), name: p.name, kind: p.kind })
          .returning({ id: schema.publisher.id });
        ids.set(p.key, firstId(inserted, "publisher"));
      }
    }

    // Programs — natural key: slug (unique). publishedVersionId is set in a
    // second pass once versions exist.
    for (const p of plan.programs) {
      const rows = await tx
        .insert(schema.program)
        .values({ id: newId(), slug: p.slug, status: p.status, publisherId: ids.get(p.publisherKey) })
        .onConflictDoUpdate({
          target: schema.program.slug,
          set: { status: p.status, publisherId: ids.get(p.publisherKey), updatedAt: new Date() },
        })
        .returning({ id: schema.program.id });
      ids.set(p.key, firstId(rows, `program ${p.slug}`));
    }

    // Program versions — natural key: (programId, version) (unique).
    for (const v of plan.versions) {
      const programId = ids.get(v.programKey)!;
      const rows = await tx
        .insert(schema.programVersion)
        .values({
          id: newId(),
          programId,
          version: v.version,
          status: v.status,
          title: v.title,
          subtitle: v.subtitle,
          ageBand: v.ageBand,
          summary: v.summary,
          world: v.world,
          locale: v.locale,
          languages: v.languages,
          publishedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.programVersion.programId, schema.programVersion.version],
          set: {
            status: v.status,
            title: v.title,
            subtitle: v.subtitle,
            ageBand: v.ageBand,
            summary: v.summary,
            world: v.world,
            locale: v.locale,
            languages: v.languages,
          },
        })
        .returning({ id: schema.programVersion.id });
      ids.set(v.key, firstId(rows, `version ${v.key}`));
    }

    // Point each program at its (now-real) published version id.
    for (const v of plan.versions) {
      const programId = ids.get(v.programKey);
      const versionId = ids.get(v.key);
      if (programId && versionId) {
        await tx
          .update(schema.program)
          .set({ publishedVersionId: versionId })
          .where(eq(schema.program.id, programId));
      }
    }

    // Units — natural key: (programVersionId, unitKey) (unique).
    for (const u of plan.units) {
      const programVersionId = ids.get(u.programVersionKey)!;
      const rows = await tx
        .insert(schema.unit)
        .values({
          id: newId(),
          programVersionId,
          unitKey: u.unitKey,
          orderKey: u.orderKey,
          title: u.title,
          emoji: u.emoji,
          world: u.world,
          bigIdea: u.bigIdea,
          phonicsFocus: u.phonicsFocus,
          mathFocus: u.mathFocus,
          project: u.project,
          checkpoint: u.checkpoint,
          branchKey: u.branchKey,
        })
        .onConflictDoUpdate({
          target: [schema.unit.programVersionId, schema.unit.unitKey],
          set: {
            orderKey: u.orderKey,
            title: u.title,
            emoji: u.emoji,
            world: u.world,
            bigIdea: u.bigIdea,
            phonicsFocus: u.phonicsFocus,
            mathFocus: u.mathFocus,
            project: u.project,
            checkpoint: u.checkpoint,
            branchKey: u.branchKey,
          },
        })
        .returning({ id: schema.unit.id });
      ids.set(u.key, firstId(rows, `unit ${u.unitKey}`));
    }

    // Lessons — natural key: (unitId, lessonKey) (unique).
    for (const l of plan.lessons) {
      const unitId = ids.get(l.unitKey)!;
      const rows = await tx
        .insert(schema.lesson)
        .values({ id: newId(), unitId, lessonKey: l.lessonKey, orderKey: l.orderKey, title: l.title })
        .onConflictDoUpdate({
          target: [schema.lesson.unitId, schema.lesson.lessonKey],
          set: { orderKey: l.orderKey, title: l.title },
        })
        .returning({ id: schema.lesson.id });
      ids.set(l.key, firstId(rows, `lesson ${l.lessonKey}`));
    }

    // Activities — natural key: (lessonId, activityKey) (unique).
    for (const a of plan.activities) {
      const lessonId = ids.get(a.lessonKey)!;
      const rows = await tx
        .insert(schema.activity)
        .values({
          id: newId(),
          lessonId,
          activityKey: a.activityKey,
          orderKey: a.orderKey,
          kind: a.kind,
          title: a.title,
          blurb: a.blurb,
          estMinutes: a.estMinutes,
          band: a.band,
          skillTags: a.skillTags,
          standardTags: a.standardTags,
          config: a.config,
        })
        .onConflictDoUpdate({
          target: [schema.activity.lessonId, schema.activity.activityKey],
          set: {
            orderKey: a.orderKey,
            kind: a.kind,
            title: a.title,
            blurb: a.blurb,
            estMinutes: a.estMinutes,
            band: a.band,
            skillTags: a.skillTags,
            standardTags: a.standardTags,
            config: a.config,
          },
        })
        .returning({ id: schema.activity.id });
      ids.set(a.key, firstId(rows, `activity ${a.activityKey}`));
    }

    // Skills (global, not program-scoped) — natural key: slug (unique).
    for (const s of plan.skills) {
      await tx
        .insert(schema.skill)
        .values({
          id: newId(),
          slug: s.slug,
          domain: s.domain,
          label: s.label,
          readyIndicator: s.readyIndicator,
          stretchIndicator: s.stretchIndicator,
        })
        .onConflictDoUpdate({
          target: schema.skill.slug,
          set: {
            domain: s.domain,
            label: s.label,
            readyIndicator: s.readyIndicator,
            stretchIndicator: s.stretchIndicator,
          },
        });
    }
  });

  console.log(
    `Seed complete: ${plan.publishers.length} publishers, ${plan.programs.length} programs, ` +
    `${plan.versions.length} versions, ${plan.units.length} units, ${plan.lessons.length} lessons, ` +
    `${plan.activities.length} activities, ${plan.skills.length} skills`,
  );
}

if (import.meta.main) {
  seedContent().catch((e: unknown) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
}
