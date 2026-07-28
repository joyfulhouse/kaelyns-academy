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
    expect(skillForKey("A")).toBe("typing.keys.shift-space");
    expect(skillForKey(" ")).toBe("typing.keys.shift-space");
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

  it("rejects untaught keys", () => {
    expect(isTeachableKey("a")).toBe(true);
    expect(isTeachableKey("A")).toBe(true);
    expect(isTeachableKey("4")).toBe(false);
    expect(isTeachableKey("é")).toBe(false);
  });
});
