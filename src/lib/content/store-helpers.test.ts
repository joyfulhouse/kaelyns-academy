import { describe, expect, it } from "vitest";
import { byOrderKey, versionColumns } from "./store";

describe("byOrderKey", () => {
  it("sorts ascending by the zero-padded orderKey", () => {
    const rows = [{ orderKey: "000002" }, { orderKey: "000000" }, { orderKey: "000001" }];
    expect([...rows].sort(byOrderKey).map((r) => r.orderKey)).toEqual([
      "000000",
      "000001",
      "000002",
    ]);
  });

  it("returns 0 for equal keys (stable no-op)", () => {
    expect(byOrderKey({ orderKey: "x" }, { orderKey: "x" })).toBe(0);
  });
});

describe("versionColumns", () => {
  it("normalises absent optional fields to null and missing languages to []", () => {
    expect(versionColumns({ title: "Only Title" })).toEqual({
      title: "Only Title",
      subtitle: null,
      ageBand: null,
      summary: null,
      world: null,
      locale: null,
      languages: [],
    });
  });

  it("passes through provided values, including a supplied languages array", () => {
    expect(
      versionColumns({
        title: "Full",
        subtitle: "Sub",
        ageBand: "5-6",
        summary: "Summary",
        world: "ocean",
        locale: "en",
        languages: ["en", "zh-TW"],
      }),
    ).toEqual({
      title: "Full",
      subtitle: "Sub",
      ageBand: "5-6",
      summary: "Summary",
      world: "ocean",
      locale: "en",
      languages: ["en", "zh-TW"],
    });
  });

  it("coerces explicit null fields to null (row-shaped input)", () => {
    // A ProgramVersionRow carries `null`s (not `undefined`) for empty columns.
    const cols = versionColumns({ title: "T", subtitle: null, world: null, languages: [] });
    expect(cols.subtitle).toBeNull();
    expect(cols.world).toBeNull();
    expect(cols.languages).toEqual([]);
  });
});
