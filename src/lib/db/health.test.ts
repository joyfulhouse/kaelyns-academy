import { describe, it, expect } from "vitest";
import { missingColumns } from "./health";

describe("missingColumns", () => {
  const required = { health_check: ["id", "note", "checked_at"] };
  it("returns [] when all present", () => {
    const live = { health_check: ["id", "note", "checked_at", "extra"] };
    expect(missingColumns(required, live)).toEqual([]);
  });
  it("reports missing as table.column", () => {
    const live = { health_check: ["id"] };
    expect(missingColumns(required, live)).toEqual(["health_check.note", "health_check.checked_at"]);
  });
});
