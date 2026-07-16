import { describe, expect, it } from "vitest";
import type { MathTenframeConfig } from "@/content/activity-configs";
import * as model from "./model";

const represent: MathTenframeConfig = {
  instruction: "Show 4.",
  mode: "represent",
  target: 4,
  frames: 1,
};
const add: MathTenframeConfig = {
  instruction: "Add 3.",
  mode: "add",
  target: 7,
  addend: 3,
  frames: 1,
};
const subtract = {
  instruction: "Take away 3.",
  mode: "subtract",
  target: 8,
  subtrahend: 3,
  frames: 1,
} as unknown as MathTenframeConfig;
const makeTen = {
  instruction: "Make ten.",
  mode: "make-ten",
  target: 7,
  addend: 8,
  frames: 2,
} as unknown as MathTenframeConfig;

describe("math-tenframe capacity and cell operations", () => {
  it("derives frame capacity", () => {
    expect(model.frameCapacity(1)).toBe(10);
    expect(model.frameCapacity(2)).toBe(20);
  });

  it("toggles one independent counter in represent mode", () => {
    const empty = model.createTenframeState(represent);
    const filled = model.toggleCounter(represent, empty, 3);
    expect(model.occupiedCellIndices(filled)).toEqual([3]);
    expect(model.representedTotal(filled)).toBe(1);
    expect(model.occupiedCellIndices(model.toggleCounter(represent, filled, 3))).toEqual([]);
  });

  it("undo reverses the last permitted counter action", () => {
    const empty = model.createTenframeState(represent);
    const filled = model.toggleCounter(represent, empty, 3);
    const undone = model.undoTenframeState([empty], filled);

    expect(undone.state).toEqual(empty);
    expect(undone.history).toEqual([]);
  });

  it("locks the first addend and tracks child-added counters separately", () => {
    const started = model.createTenframeState(add);
    expect(started.cells.slice(0, 7)).toEqual(Array.from({ length: 7 }, () => "preset"));
    const placed = model.toggleCounter(add, started, 7);
    expect(placed.cells[7]).toBe("added");
    expect(placed.placements).toEqual([7]);
    expect(model.representedTotal(placed)).toBe(8);
    expect(model.toggleCounter(add, placed, 0)).toEqual(placed);
  });

  it("starts subtract mode filled and removes or restores individual counters", () => {
    const started = model.createTenframeState(subtract);
    const removed = model.toggleCounter(subtract, started, 2);
    expect(removed.cells[2]).toBeNull();
    expect(removed.removals).toEqual([2]);
    expect(model.representedTotal(removed)).toBe(7);
    expect(model.toggleCounter(subtract, removed, 2)).toEqual(started);
  });
});

describe("math-tenframe full-frame trade", () => {
  it("requires a full first frame, trades it for one ten token, then continues", () => {
    let state = model.createTenframeState(makeTen);
    expect(model.canTradeFirstFrame(state)).toBe(false);

    state = model.toggleCounter(makeTen, state, 7);
    state = model.toggleCounter(makeTen, state, 8);
    state = model.toggleCounter(makeTen, state, 9);
    expect(model.canTradeFirstFrame(state)).toBe(true);

    state = model.tradeFirstFrame(state);
    expect(state.tenTokens).toBe(1);
    expect(state.tradeAtPlacement).toBe(3);
    expect(state.cells.slice(0, 10).every((cell) => cell === null)).toBe(true);
    expect(model.representedTotal(state)).toBe(10);

    state = model.toggleCounter(makeTen, state, 10);
    expect(state.cells[10]).toBe("added");
    expect(model.representedTotal(state)).toBe(11);
  });

  it("does not trade an incomplete frame", () => {
    const state = model.createTenframeState(makeTen);
    expect(model.tradeFirstFrame(state)).toEqual(state);
  });
});
