import { describe, expect, it } from "vitest";
import * as model from "./model";

describe("math-array build model", () => {
  it("adds and removes complete rows within the authored row bound", () => {
    expect(model.addCompleteRow(0, 2)).toBe(1);
    expect(model.addCompleteRow(2, 2)).toBe(2);
    expect(model.removeCompleteRow(2)).toBe(1);
    expect(model.removeCompleteRow(0)).toBe(0);
  });

  it("returns the built tiles in row-major order", () => {
    expect(model.rowMajorTileIndices(2, 3)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(model.rowMajorTileIndices(0, 3)).toEqual([]);
  });
});

describe("math-array multiply model", () => {
  it("reveals one complete row at a time and derives the skip-count trail", () => {
    expect(model.revealNextRow(0, 3)).toBe(1);
    expect(model.revealNextRow(3, 3)).toBe(3);
    expect(model.skipCountSequence(3, 4)).toEqual([4, 8, 12]);
  });

  it("offers a bounded, unique result choice set containing the derived total", () => {
    const choices = model.resultChoices(12);
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
    expect(choices).toContain(12);
    expect(choices.every((choice) => choice >= 0 && choice <= 144)).toBe(true);
  });
});

describe("math-array divide model", () => {
  it("deals a visible pool round-robin into equal labeled groups", () => {
    let state = model.createDealState(6, 3);

    for (let index = 0; index < 6; index += 1) {
      state = model.dealNextItem(state);
    }

    expect(state.pool).toEqual([]);
    expect(state.groups).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
    ]);
    expect(model.isEqualDealComplete(state)).toBe(true);
  });

  it("does not deal after the pool is empty", () => {
    const complete = model.dealNextItem(model.createDealState(1, 1));
    expect(model.dealNextItem(complete)).toEqual(complete);
  });

  it("derives all four multiplication and division facts from one sharing model", () => {
    expect(model.factFamilyFor(12, 3)).toEqual([
      { left: 3, operator: "×", right: 4, result: 12 },
      { left: 4, operator: "×", right: 3, result: 12 },
      { left: 12, operator: "÷", right: 3, result: 4 },
      { left: 12, operator: "÷", right: 4, result: 3 },
    ]);
  });
});

describe("math-array area model", () => {
  it("toggles individual unit squares and detects complete coverage", () => {
    let cells = model.createAreaCells(2, 2);
    expect(model.isAreaComplete(cells)).toBe(false);

    for (let index = 0; index < cells.length; index += 1) {
      cells = model.toggleAreaCell(cells, index);
    }
    expect(model.filledAreaIndices(cells)).toEqual([0, 1, 2, 3]);
    expect(model.isAreaComplete(cells)).toBe(true);

    cells = model.toggleAreaCell(cells, 1);
    expect(model.filledAreaIndices(cells)).toEqual([0, 2, 3]);
    expect(model.isAreaComplete(cells)).toBe(false);
  });
});
