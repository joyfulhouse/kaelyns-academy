import { describe, expect, it } from "vitest";
import { getActivityType } from "@/activities";
import { oralReadingSentenceConfig } from "../activity-configs";
import { DECODABLE_LIBRARY, decodableReaderActivities } from ".";

describe("decodable reader library", () => {
  it("keeps every authored passage inside the sentence-reading limits", () => {
    for (const group of DECODABLE_LIBRARY) {
      for (const passage of group.passages) {
        expect(passage.split(/\s+/).length, passage).toBeLessThanOrEqual(7);
        expect(passage.length, passage).toBeLessThanOrEqual(60);
        expect(passage, passage).toMatch(/[a-z0-9]/i);
      }
    }
  });

  it("builds unique, valid sentence activities with aligned skill evidence", () => {
    const activities = decodableReaderActivities();
    const ids = activities.map(({ id }) => id);
    const oralReading = getActivityType("oral-reading");

    expect(new Set(ids).size).toBe(ids.length);
    expect(activities).toHaveLength(
      DECODABLE_LIBRARY.reduce((total, group) => total + group.passages.length, 0),
    );
    expect(oralReading).toBeDefined();

    for (const activity of activities) {
      expect(activity.kind).toBe("oral-reading");
      if (activity.kind !== "oral-reading") continue;

      expect(activity.config.mode).toBe("sentence");
      if (activity.config.mode !== "sentence") continue;

      expect(activity.config.presentation).toBe("cold");
      expect(() => oralReadingSentenceConfig.parse(activity.config)).not.toThrow();
      for (const skill of oralReading!.skillsAffected(activity.config)) {
        expect(activity.skillTags, `${activity.id} emits ${skill}`).toContain(skill);
      }
    }
  });
});
