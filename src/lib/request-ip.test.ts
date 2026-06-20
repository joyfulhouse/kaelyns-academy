import { describe, expect, it } from "vitest";
import { clientIp } from "./request-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("prefers Cloudflare's cf-connecting-ip (unspoofable on the public path)", () => {
    expect(
      clientIp(h({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.5, 10.0.0.1, 10.0.0.2" }))).toBe(
      "198.51.100.5",
    );
  });

  it("trims whitespace", () => {
    expect(clientIp(h({ "cf-connecting-ip": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("returns null when no IP header is present", () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "" }))).toBeNull();
  });
});
