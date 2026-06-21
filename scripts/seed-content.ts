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

async function seedContent(): Promise<void> {
  // Lazy import keeps getDb() off the module top-level.
  const { getDb } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const { listPrograms, SKILLS } = await import("@/content");

  const db = getDb();
  const plan = buildSeedPlan(listPrograms(), SKILLS);

  // UUID map: intra-plan key → inserted DB id
  const ids = new Map<string, string>();
  const newId = () => globalThis.crypto.randomUUID();

  // Publishers
  for (const p of plan.publishers) {
    const id = newId();
    ids.set(p.key, id);
    await db.insert(schema.publisher).values({ id, name: p.name, kind: p.kind })
      .onConflictDoNothing();
  }

  // Programs
  for (const p of plan.programs) {
    const id = newId();
    ids.set(p.key, id);
    await db.insert(schema.program).values({
      id,
      slug: p.slug,
      status: p.status,
      publisherId: ids.get(p.publisherKey),
    }).onConflictDoNothing();
  }

  // Program versions
  for (const v of plan.versions) {
    const id = newId();
    ids.set(v.key, id);
    await db.insert(schema.programVersion).values({
      id,
      programId: ids.get(v.programKey)!,
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
    }).onConflictDoNothing();
  }

  // Update publishedVersionId on each program
  for (const v of plan.versions) {
    const programId = ids.get(v.programKey);
    const versionId = ids.get(v.key);
    if (programId && versionId) {
      const { eq } = await import("drizzle-orm");
      await db.update(schema.program)
        .set({ publishedVersionId: versionId })
        .where(eq(schema.program.id, programId));
    }
  }

  // Units
  for (const u of plan.units) {
    const id = newId();
    ids.set(u.key, id);
    await db.insert(schema.unit).values({
      id,
      programVersionId: ids.get(u.programVersionKey)!,
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
    }).onConflictDoNothing();
  }

  // Lessons
  for (const l of plan.lessons) {
    const id = newId();
    ids.set(l.key, id);
    await db.insert(schema.lesson).values({
      id,
      unitId: ids.get(l.unitKey)!,
      lessonKey: l.lessonKey,
      orderKey: l.orderKey,
      title: l.title,
    }).onConflictDoNothing();
  }

  // Activities
  for (const a of plan.activities) {
    const id = newId();
    ids.set(a.key, id);
    await db.insert(schema.activity).values({
      id,
      lessonId: ids.get(a.lessonKey)!,
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
    }).onConflictDoNothing();
  }

  // Skills (global, not program-scoped)
  for (const s of plan.skills) {
    await db.insert(schema.skill).values({
      id: newId(),
      slug: s.slug,
      domain: s.domain,
      label: s.label,
      readyIndicator: s.readyIndicator,
      stretchIndicator: s.stretchIndicator,
    }).onConflictDoNothing();
  }

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
