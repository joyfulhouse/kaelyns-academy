import { describe, expect, it } from "vitest";
import { readJsonBody } from "./http";

/** Build a POST Request with an optional explicit content-length header. */
function req(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("readJsonBody", () => {
  it("returns the parsed body for valid JSON under the cap", async () => {
    const result = await readJsonBody(req(JSON.stringify({ a: 1 })), 16384);
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it("413s payload_too_large when content-length exceeds the cap (before parsing)", async () => {
    const result = await readJsonBody(req("{}", { "content-length": "20000" }), 16384);
    expect(result).toEqual({ ok: false, status: 413, error: "payload_too_large" });
  });

  it("allows a body whose content-length is exactly at the cap", async () => {
    const result = await readJsonBody(
      req(JSON.stringify({ a: 1 }), { "content-length": "16384" }),
      16384,
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("skips the size guard when content-length is absent or non-numeric", async () => {
    const result = await readJsonBody(
      req(JSON.stringify({ a: 1 }), { "content-length": "not-a-number" }),
      16384,
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("400s invalid_json when the body is not parseable JSON", async () => {
    const result = await readJsonBody(req("{ not json"), 16384);
    expect(result).toEqual({ ok: false, status: 400, error: "invalid_json" });
  });

  it("parses a literal null without throwing (route-specific null guard handles it)", async () => {
    const result = await readJsonBody(req("null"), 16384);
    expect(result).toEqual({ ok: true, body: null });
  });
});
