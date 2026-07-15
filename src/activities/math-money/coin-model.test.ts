import { describe, expect, it } from "vitest";
import {
  COIN_FACTS,
  hasCoinCapacity,
  minimumCoinsForTotal,
  reduceCoinTray,
  sumCoins,
  type CoinToken,
} from "./coin-model";

describe("COIN_FACTS", () => {
  it("defines each supported US coin name and cent value once", () => {
    expect(COIN_FACTS.penny).toMatchObject({ name: "Penny", cents: 1 });
    expect(COIN_FACTS.nickel).toMatchObject({ name: "Nickel", cents: 5 });
    expect(COIN_FACTS.dime).toMatchObject({ name: "Dime", cents: 10 });
    expect(COIN_FACTS.quarter).toMatchObject({ name: "Quarter", cents: 25 });
  });

  it("preserves truthful relative diameters", () => {
    expect(COIN_FACTS.dime.diameter).toBeLessThan(COIN_FACTS.penny.diameter);
    expect(COIN_FACTS.penny.diameter).toBeLessThan(COIN_FACTS.nickel.diameter);
    expect(COIN_FACTS.nickel.diameter).toBeLessThan(COIN_FACTS.quarter.diameter);
  });
});

describe("coin tray operations", () => {
  const first: CoinToken = { id: "coin-1", type: "nickel" };
  const second: CoinToken = { id: "coin-2", type: "nickel" };

  it("adds stable token instances, including duplicate coin types", () => {
    const once = reduceCoinTray([], { type: "place", token: first });
    const twice = reduceCoinTray(once, { type: "place", token: second });

    expect(twice).toEqual([first, second]);
    expect(twice[0]).toBe(first);
    expect(
      reduceCoinTray(twice, { type: "place", token: { id: "coin-2", type: "dime" } }),
    ).toBe(twice);
  });

  it("removes only the selected token instance", () => {
    expect(reduceCoinTray([first, second], { type: "remove", tokenId: first.id })).toEqual([
      second,
    ]);
    const tray = [first, second];
    expect(reduceCoinTray(tray, { type: "remove", tokenId: "missing" })).toBe(tray);
  });

  it("clears the tray through the same reducer used for placement and removal", () => {
    expect(reduceCoinTray([first, second], { type: "clear" })).toEqual([]);
    const empty: CoinToken[] = [];
    expect(reduceCoinTray(empty, { type: "clear" })).toBe(empty);
  });

  it("sums the selected token facts rather than a client total", () => {
    expect(sumCoins([first, second, { id: "coin-3", type: "penny" }])).toBe(11);
    expect(sumCoins([])).toBe(0);
  });

  it("allows an over-target tray to stay editable until the safety cap", () => {
    const expensiveTray = Array.from({ length: 19 }, (_, index) => ({
      id: `coin-${index}`,
      type: "quarter" as const,
    }));

    expect(sumCoins(expensiveTray)).toBe(475);
    expect(hasCoinCapacity(expensiveTray)).toBe(true);
    expect(hasCoinCapacity([...expensiveTray, { id: "coin-20", type: "quarter" }])).toBe(false);
    const full = [...expensiveTray, { id: "coin-20", type: "quarter" as const }];
    expect(
      reduceCoinTray(full, { type: "place", token: { id: "coin-21", type: "penny" } }),
    ).toBe(full);
  });
});

describe("minimumCoinsForTotal", () => {
  it("finds a bounded exact combination or reports an unreachable target", () => {
    expect(minimumCoinsForTotal(["nickel", "dime"], 35)).toBe(4);
    expect(minimumCoinsForTotal(["nickel"], 7)).toBeNull();
  });
});
