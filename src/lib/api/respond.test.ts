import { describe, expect, it } from "vitest";
import { jsonError } from "./respond";

describe("jsonError", () => {
  it("builds a JSON {error} envelope with the given status", async () => {
    const res = jsonError("invalid_json", 400);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("preserves arbitrary error strings and status codes", async () => {
    const res = jsonError("payload_too_large", 413);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "payload_too_large" });
  });
});
