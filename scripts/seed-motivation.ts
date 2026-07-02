/**
 * Seed script — Adventure 2.0 Phase A motivation taxonomies (Task 12).
 *
 * buildMotivationSeedPlan: PURE transform (no DB, no side effects) — the
 * interest / sticker-pack / quest-template content, unit-tested directly
 * (seed-motivation.test.ts) including through the pure validators
 * (validateArtRef, validateTemplateInput) so a typo'd emoji or a kind/params
 * mismatch fails the test suite instead of a live insert.
 *
 * seedMotivation: thin DB glue, CLI-guarded. Call only from the command line:
 *   bun scripts/seed-motivation.ts
 * NEVER imported for DB side-effects at module load (mirrors seed-content.ts's
 * env/connection preamble: a lazy getDb() import inside the async function, and
 * an import.meta.main guard around the CLI invocation).
 */

import type { QuestKind } from "@/lib/quests/config";

// ── Row shapes (seed content, not DB ids) ────────────────────────────────────

interface InterestSeedRow {
  slug: string;
  label: string;
  icon: string;
  status: "published";
}

interface StickerSeedRow {
  slug: string;
  title: string;
  artRef: string;
  starCost: number;
}

interface StickerPackSeedRow {
  slug: string;
  title: string;
  theme: string;
  status: "published";
  /** Learner-shop pack order — getStickerCatalog sorts by pack sortKey then
   *  sticker sortKey, so the three packs must not all tie on the DB default
   *  "a" (review finding). Sticker sortKeys derive from array position. */
  sortKey: string;
  stickers: StickerSeedRow[];
}

interface QuestTemplateSeedRow {
  slug: string;
  title: string;
  kind: QuestKind;
  params: unknown;
  rewardStars: number;
  status: "published";
}

export interface MotivationSeedPlan {
  interests: InterestSeedRow[];
  stickerPacks: StickerPackSeedRow[];
  questTemplates: QuestTemplateSeedRow[];
}

// ── buildMotivationSeedPlan ──────────────────────────────────────────────────

export function buildMotivationSeedPlan(): MotivationSeedPlan {
  const interests: InterestSeedRow[] = [
    { slug: "dinosaurs", label: "Dinosaurs", icon: "🦕", status: "published" },
    { slug: "space", label: "Space", icon: "🚀", status: "published" },
    { slug: "ocean-animals", label: "Ocean Animals", icon: "🐬", status: "published" },
    { slug: "fairies", label: "Fairies", icon: "🧚", status: "published" },
    { slug: "dogs-and-cats", label: "Dogs & Cats", icon: "🐶", status: "published" },
    { slug: "robots", label: "Robots", icon: "🤖", status: "published" },
    { slug: "princesses", label: "Princesses", icon: "👑", status: "published" },
    { slug: "sports", label: "Sports", icon: "⚽", status: "published" },
    { slug: "music", label: "Music", icon: "🎵", status: "published" },
    { slug: "drawing-and-art", label: "Drawing & Art", icon: "🎨", status: "published" },
    { slug: "bugs-and-butterflies", label: "Bugs & Butterflies", icon: "🦋", status: "published" },
    { slug: "trucks-and-trains", label: "Trucks & Trains", icon: "🚂", status: "published" },
  ];

  const stickerPacks: StickerPackSeedRow[] = [
    {
      slug: "woodland-friends",
      title: "Woodland Friends",
      theme: "Woodland",
      status: "published",
      sortKey: "a",
      stickers: [
        { slug: "clever-fox", title: "Clever Fox", artRef: "emoji:🦊", starCost: 3 },
        { slug: "wise-owl", title: "Wise Owl", artRef: "emoji:🦉", starCost: 4 },
        { slug: "busy-squirrel", title: "Busy Squirrel", artRef: "emoji:🐿️", starCost: 5 },
        { slug: "gentle-deer", title: "Gentle Deer", artRef: "emoji:🦌", starCost: 6 },
        { slug: "cozy-bear", title: "Cozy Bear", artRef: "emoji:🐻", starCost: 7 },
        { slug: "quick-rabbit", title: "Quick Rabbit", artRef: "emoji:🐇", starCost: 8 },
        { slug: "tiny-mushroom", title: "Tiny Mushroom", artRef: "emoji:🍄", starCost: 9 },
        { slug: "little-acorn", title: "Little Acorn", artRef: "emoji:🌰", starCost: 10 },
      ],
    },
    {
      slug: "space-explorers",
      title: "Space Explorers",
      theme: "Space",
      status: "published",
      sortKey: "b",
      stickers: [
        { slug: "zoom-rocket", title: "Zoom Rocket", artRef: "emoji:🚀", starCost: 3 },
        { slug: "ringed-planet", title: "Ringed Planet", artRef: "emoji:🪐", starCost: 4 },
        { slug: "shining-star", title: "Shining Star", artRef: "emoji:⭐", starCost: 5 },
        { slug: "sleepy-moon", title: "Sleepy Moon", artRef: "emoji:🌙", starCost: 6 },
        { slug: "brave-astronaut", title: "Brave Astronaut", artRef: "emoji:👩‍🚀", starCost: 7 },
        { slug: "mystery-saucer", title: "Mystery Saucer", artRef: "emoji:🛸", starCost: 8 },
        { slug: "streaking-comet", title: "Streaking Comet", artRef: "emoji:☄️", starCost: 9 },
        { slug: "home-planet", title: "Home Planet", artRef: "emoji:🌍", starCost: 10 },
      ],
    },
    {
      slug: "ocean-pals",
      title: "Ocean Pals",
      theme: "Ocean",
      status: "published",
      sortKey: "c",
      stickers: [
        { slug: "playful-dolphin", title: "Playful Dolphin", artRef: "emoji:🐬", starCost: 3 },
        { slug: "steady-turtle", title: "Steady Turtle", artRef: "emoji:🐢", starCost: 4 },
        { slug: "wiggly-octopus", title: "Wiggly Octopus", artRef: "emoji:🐙", starCost: 5 },
        { slug: "sideways-crab", title: "Sideways Crab", artRef: "emoji:🦀", starCost: 6 },
        { slug: "bright-fish", title: "Bright Fish", artRef: "emoji:🐠", starCost: 7 },
        { slug: "bold-shark", title: "Bold Shark", artRef: "emoji:🦈", starCost: 8 },
        { slug: "spiral-shell", title: "Spiral Shell", artRef: "emoji:🐚", starCost: 9 },
        { slug: "rolling-wave", title: "Rolling Wave", artRef: "emoji:🌊", starCost: 10 },
      ],
    },
  ];

  const questTemplates: QuestTemplateSeedRow[] = [
    {
      slug: "daily-three",
      title: "Do 3 activities",
      kind: "complete_n",
      params: { count: 3 },
      rewardStars: 3,
      status: "published",
    },
    {
      slug: "explore-strand",
      title: "Explore {focus}",
      kind: "try_strand",
      params: {},
      rewardStars: 2,
      status: "published",
    },
    {
      slug: "level-up-skill",
      title: "Level up: {focus}",
      kind: "practice_skill",
      params: {},
      rewardStars: 2,
      status: "published",
    },
  ];

  return { interests, stickerPacks, questTemplates };
}

// ── seedMotivation ────────────────────────────────────────────────────────────
// DB glue: inserts the plan into the database. CLI-guarded so this function is
// never called at module load (build-safety) — mirrors seed-content.ts.
//
// Idempotent + transactional: one transaction, every insert an
// upsert-with-RETURNING keyed on the row's natural unique constraint (slug, or
// (packId, slug) for stickers) — a re-run converges to the same published rows
// instead of erroring or duplicating.

async function seedMotivation(): Promise<void> {
  // Lazy import keeps getDb() off the module top-level.
  const { getDb } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");

  const db = getDb();
  const plan = buildMotivationSeedPlan();
  const newId = () => globalThis.crypto.randomUUID();

  /** First returned id, or a clear error (an upsert+returning must yield a row). */
  function firstId(rows: { id: string }[], what: string): string {
    if (!rows[0]?.id) throw new Error(`seed-motivation: ${what} upsert returned no row`);
    return rows[0].id;
  }

  await db.transaction(async (tx) => {
    // Interests — natural key: slug (unique).
    for (const i of plan.interests) {
      await tx
        .insert(schema.interest)
        .values({ id: newId(), slug: i.slug, label: i.label, icon: i.icon, status: i.status })
        .onConflictDoUpdate({
          target: schema.interest.slug,
          set: { label: i.label, icon: i.icon, status: i.status },
        });
    }

    // Sticker packs — natural key: slug (unique). Stickers — natural key:
    // (packId, slug) (unique) — resolved once the pack's real id is known.
    for (const pack of plan.stickerPacks) {
      const packRows = await tx
        .insert(schema.stickerPack)
        .values({
          id: newId(),
          slug: pack.slug,
          title: pack.title,
          theme: pack.theme,
          status: pack.status,
          sortKey: pack.sortKey,
        })
        .onConflictDoUpdate({
          target: schema.stickerPack.slug,
          set: { title: pack.title, theme: pack.theme, status: pack.status, sortKey: pack.sortKey },
        })
        .returning({ id: schema.stickerPack.id });
      const packId = firstId(packRows, `sticker pack ${pack.slug}`);

      for (const [sIdx, s] of pack.stickers.entries()) {
        // Sticker sortKey: authored array position as a lexically-sortable
        // letter ("a".."h" for the 8-per-pack seed content).
        const sortKey = String.fromCharCode(97 + sIdx);
        await tx
          .insert(schema.sticker)
          .values({
            id: newId(),
            packId,
            slug: s.slug,
            title: s.title,
            artRef: s.artRef,
            starCost: s.starCost,
            sortKey,
          })
          .onConflictDoUpdate({
            target: [schema.sticker.packId, schema.sticker.slug],
            set: { title: s.title, artRef: s.artRef, starCost: s.starCost, sortKey },
          });
      }
    }

    // Quest templates — natural key: slug (unique).
    for (const t of plan.questTemplates) {
      await tx
        .insert(schema.questTemplate)
        .values({
          id: newId(),
          slug: t.slug,
          title: t.title,
          kind: t.kind,
          params: t.params,
          rewardStars: t.rewardStars,
          status: t.status,
        })
        .onConflictDoUpdate({
          target: schema.questTemplate.slug,
          set: {
            title: t.title,
            kind: t.kind,
            params: t.params,
            rewardStars: t.rewardStars,
            status: t.status,
          },
        });
    }
  });

  const stickerCount = plan.stickerPacks.reduce((n, p) => n + p.stickers.length, 0);
  console.log(
    `Seed complete: ${plan.interests.length} interests, ${plan.stickerPacks.length} sticker packs ` +
      `(${stickerCount} stickers), ${plan.questTemplates.length} quest templates`,
  );
}

if (import.meta.main) {
  seedMotivation().catch((e: unknown) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
}
