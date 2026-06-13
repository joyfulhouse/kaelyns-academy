import { describe, it, expect } from "vitest";

describe("db client", () => {
  it("does not connect at import time", async () => {
    delete process.env.DATABASE_URL;
    const mod = await import("./index");
    expect(typeof mod.getDb).toBe("function");
  });
});
