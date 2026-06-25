import { describe, expect, it } from "vitest";
import { firstConfigError } from "./ProgramEditor";
import { defaultConfigFor, newActivity, newLesson, newUnit } from "@/lib/admin/editor-model";
import type { EditorFormValues } from "@/lib/admin/editor-model";
import type { ActivityKind } from "@/content/activity-configs";

// firstConfigError is the pure config save-gate the editor renders its error
// banner from. The contract that matters: a bad configJson anywhere in the tree
// surfaces a *specific, on-brand* message (so a failed save is never silent), an
// all-valid tree returns null (the save proceeds), and the message names the
// activity by its human title (falling back to its key) so an admin can find it.

/** Build a one-activity tree with the given kind + raw config JSON. */
function treeWith(kind: ActivityKind, configJson: string, title = ""): EditorFormValues["units"] {
  const activity = { ...newActivity(), kind, configJson, title };
  const lesson = { ...newLesson(), activities: [activity] };
  return [{ ...newUnit(), lessons: [lesson] }];
}

const validJson = (kind: ActivityKind): string => JSON.stringify(defaultConfigFor(kind));

describe("firstConfigError", () => {
  it("returns null when every activity config is valid", () => {
    const units = treeWith("math-tenframe", validJson("math-tenframe"));
    expect(firstConfigError(units)).toBeNull();
  });

  it("returns null for an empty tree (no units to validate)", () => {
    expect(firstConfigError([])).toBeNull();
  });

  it("flags a config that is not valid JSON", () => {
    const units = treeWith("math-tenframe", "{ not json", "Counting to Five");
    const msg = firstConfigError(units);
    expect(msg).toContain("Counting to Five");
  });

  it("flags a config that is valid JSON but fails its per-kind schema", () => {
    // math-array requires rows/cols/mode; an empty object parses as JSON but not
    // against the schema.
    const units = treeWith("math-array", "{}", "Build the Array");
    const msg = firstConfigError(units);
    expect(msg).not.toBeNull();
    expect(msg).toContain("Build the Array");
  });

  it("falls back to the activity key when the title is blank", () => {
    const units = treeWith("math-array", "{}", "");
    const activityKey = units[0].lessons[0].activities[0].activityKey;
    const msg = firstConfigError(units);
    expect(msg).toContain(activityKey);
  });

  it("reports the first invalid activity across the nested tree", () => {
    const goodUnits = treeWith("math-tenframe", validJson("math-tenframe"), "Good One");
    const badLesson = {
      ...newLesson(),
      activities: [{ ...newActivity(), kind: "math-array" as ActivityKind, configJson: "{}", title: "Bad One" }],
    };
    goodUnits[0].lessons.push(badLesson);
    expect(firstConfigError(goodUnits)).toContain("Bad One");
  });
});
