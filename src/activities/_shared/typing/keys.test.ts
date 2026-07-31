import { describe, expect, it } from "vitest";
import {
  KEY_FINGERS,
  TYPING_ROWS,
  isTeachableKey,
  rowOf,
  skillForKey,
  skillsForTargets,
} from "./keys";

describe("key/finger tables", () => {
  it("assigns a finger to every key on the board, and boards every fingered key", () => {
    const board = [...Object.values(TYPING_ROWS).flat(), " "];
    for (const key of board) expect(KEY_FINGERS[key], key).toBeDefined();
    expect(new Set(board).size).toBe(board.length);
    expect(Object.keys(KEY_FINGERS).sort()).toEqual([...board].sort());
  });

  it("puts the home-row anchors under the index fingers", () => {
    expect(KEY_FINGERS["f"]).toEqual({ hand: "left", finger: "index" });
    expect(KEY_FINGERS["j"]).toEqual({ hand: "right", finger: "index" });
    expect(KEY_FINGERS[" "]).toEqual({ hand: "right", finger: "thumb" });
  });

  it("classifies rows", () => {
    expect(rowOf("a")).toBe("home");
    expect(rowOf("q")).toBe("top");
    expect(rowOf("z")).toBe("bottom");
    expect(rowOf(" ")).toBe("space");
  });

  it("treats any capital as shift work, whatever row the letter sits on", () => {
    expect(skillForKey("a")).toBe("typing.keys.home-row");
    expect(skillForKey("A")).toBe("typing.keys.shift");
    expect(skillForKey(" ")).toBe("typing.keys.space");
    expect(skillForKey("q")).toBe("typing.keys.top-row");
    expect(skillForKey("z")).toBe("typing.keys.bottom-row");
  });

  it("derives a sorted, deduped skill set from single-character targets", () => {
    expect(skillsForTargets(["a", "s", "d", "f"])).toEqual(["typing.keys.home-row"]);
    expect(skillsForTargets(["a", "q"])).toEqual([
      "typing.keys.home-row",
      "typing.keys.top-row",
    ]);
  });

  it("treats any multi-character target as word typing", () => {
    expect(skillsForTargets(["sad", "dad"])).toEqual(["typing.words.familiar"]);
    expect(skillsForTargets(["a", "sad"])).toEqual(["typing.words.familiar"]);
  });

  it("splits word typing by whether the letters leave the home row", () => {
    expect(skillsForTargets(["sad", "flask"])).toEqual(["typing.words.familiar"]);
    expect(skillsForTargets(["cat", "jump"])).toEqual(["typing.words.reach"]);
    // One reach makes the whole set a reaching set.
    expect(skillsForTargets(["sad", "cat"])).toEqual(["typing.words.reach"]);
  });

  it("keeps the space free and judges a capital by its letter", () => {
    // The thumb never leaves the space bar, and shift is its own skill — so a
    // capitalised home-row word is still home-row work (this is what keeps Big
    // Letters' "Fj"/"Dk"/"Sl" on the familiar tag).
    expect(skillsForTargets(["sad dad"])).toEqual(["typing.words.familiar"]);
    expect(skillsForTargets(["Sal"])).toEqual(["typing.words.familiar"]);
  });

  // This runs over whole sentences and over generated practice, so an untaught
  // character must CLASSIFY rather than throw the way rowOf does.
  it("classifies punctuation as a reach instead of throwing", () => {
    expect(() => skillsForTargets(["a lad."])).not.toThrow();
    expect(skillsForTargets(["a lad."])).toEqual(["typing.words.reach"]);
    expect(skillsForTargets(["ask!"])).toEqual(["typing.words.reach"]);
    expect(skillsForTargets(["The fat cat sat."])).toEqual(["typing.words.reach"]);
  });

  it("rejects untaught keys", () => {
    expect(isTeachableKey("a")).toBe(true);
    expect(isTeachableKey("A")).toBe(true);
    expect(isTeachableKey("4")).toBe(false);
    expect(isTeachableKey("é")).toBe(false);
  });
});
