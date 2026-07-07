import { describe, it, expect, vi } from "vitest";

// pickGenerationTargets is pure; mock its two collaborators so the test controls
// which kinds are generable and what a skill's label resolves to — independent
// of the real (heavy) practice module and the content rubric.
vi.mock("@/lib/ai/practice", () => ({
  isGenerableKind: (kind: string) => kind !== "authored-only",
}));
vi.mock("@/content", () => ({
  getSkill: (tag: string) => (tag === "known.skill" ? { label: "Known Skill" } : undefined),
}));

import { pickGenerationTargets, SHELF_BATCH, SHELF_LESSON_CAP } from "./shelf";
import type { Lesson } from "@/content";

/** Minimal Lesson fixture — pickGenerationTargets only reads each activity's
 *  kind/skillTags/title, so the rest is filled to satisfy the type. */
function lesson(activities: { kind: string; skillTags?: string[]; title?: string }[]): Lesson {
  return {
    id: "lsn",
    order: 1,
    title: "Lesson",
    activities: activities.map((a, i) => ({
      id: `a${i}`,
      title: a.title ?? `Activity ${i}`,
      skillTags: a.skillTags ?? [],
      band: "ready",
      kind: a.kind,
      config: {},
    })),
  } as unknown as Lesson;
}

describe("pickGenerationTargets", () => {
  it("exports the bounded batch + per-lesson cap", () => {
    expect(SHELF_BATCH).toBe(4);
    expect(SHELF_LESSON_CAP).toBe(8);
  });

  it("gives a single-kind lesson one target with the whole batch", () => {
    const targets = pickGenerationTargets(lesson([{ kind: "phonics-wordbuild" }]), 4);
    expect(targets).toHaveLength(1);
    expect(targets[0].kind).toBe("phonics-wordbuild");
    expect(targets[0].n).toBe(4);
  });

  it("splits the batch across kinds, earlier groups getting the remainder (3 kinds → 2/1/1)", () => {
    const targets = pickGenerationTargets(
      lesson([{ kind: "k1" }, { kind: "k2" }, { kind: "k3" }]),
      4,
    );
    expect(targets.map((t) => t.n)).toEqual([2, 1, 1]);
    expect(targets.map((t) => t.kind)).toEqual(["k1", "k2", "k3"]);
  });

  it("groups by kind (first activity of each kind is the representative)", () => {
    const targets = pickGenerationTargets(
      lesson([
        { kind: "phonics-wordbuild", title: "First" },
        { kind: "phonics-wordbuild", title: "Second" },
      ]),
      4,
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].n).toBe(4);
    expect(targets[0].sourceTitle).toBe("First");
  });

  it("ignores non-generable activities when grouping", () => {
    const targets = pickGenerationTargets(
      lesson([{ kind: "phonics-wordbuild" }, { kind: "authored-only" }, { kind: "math-array" }]),
      4,
    );
    // Two generable kinds share the batch evenly; the authored-only kind drops out.
    expect(targets.map((t) => t.kind)).toEqual(["phonics-wordbuild", "math-array"]);
    expect(targets.map((t) => t.n)).toEqual([2, 2]);
  });

  it("returns [] for a lesson with only non-generable activities", () => {
    expect(pickGenerationTargets(lesson([{ kind: "authored-only" }]), 4)).toEqual([]);
  });

  it("returns [] for an empty lesson and for a non-positive batch", () => {
    expect(pickGenerationTargets(lesson([]), 4)).toEqual([]);
    expect(pickGenerationTargets(lesson([{ kind: "phonics-wordbuild" }]), 0)).toEqual([]);
    expect(pickGenerationTargets(lesson([{ kind: "phonics-wordbuild" }]), -1)).toEqual([]);
  });

  it("derives focus from the primary skill's label, falling back to the title", () => {
    const withSkill = pickGenerationTargets(
      lesson([{ kind: "phonics-wordbuild", skillTags: ["known.skill"], title: "Build words" }]),
      4,
    );
    expect(withSkill[0].focus).toBe("Known Skill");

    const noSkill = pickGenerationTargets(
      lesson([{ kind: "phonics-wordbuild", skillTags: ["unknown.skill"], title: "Build words" }]),
      4,
    );
    expect(noSkill[0].focus).toBe("Build words");

    const noTags = pickGenerationTargets(
      lesson([{ kind: "phonics-wordbuild", skillTags: [], title: "Build words" }]),
      4,
    );
    expect(noTags[0].focus).toBe("Build words");
  });

  it("drops groups that would round down to zero items (batch < kinds)", () => {
    // batch 1 across 3 kinds → only the first group gets an item; the other two
    // (n=0) are filtered out.
    const targets = pickGenerationTargets(
      lesson([{ kind: "k1" }, { kind: "k2" }, { kind: "k3" }]),
      1,
    );
    expect(targets).toHaveLength(1);
    expect(targets[0].kind).toBe("k1");
    expect(targets[0].n).toBe(1);
  });
});
