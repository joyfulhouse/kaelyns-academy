import { describe, expect, it } from "vitest";
import type { AccountContext } from "@/lib/tenancy";
import { resolveRateLimit } from "./rate";

const ACCOUNT_POLICY = { limit: 30, windowMs: 60_000 };
const ANON_POLICY = { limit: 10, windowMs: 60_000 };
const policies = { account: ACCOUNT_POLICY, anon: ANON_POLICY };

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://test", { headers });
}

describe("resolveRateLimit", () => {
  it("keys a signed-in account by accountId with the account policy", () => {
    const account: AccountContext = { accountId: "acc-1", userId: "acc-1" };
    expect(resolveRateLimit(account, req(), "practice", policies)).toEqual({
      key: "practice:acct:acc-1",
      policy: ACCOUNT_POLICY,
    });
  });

  it("keys an anonymous caller by client IP with the anon policy", () => {
    const result = resolveRateLimit(
      null,
      req({ "cf-connecting-ip": "203.0.113.7" }),
      "tts",
      policies,
    );
    expect(result).toEqual({ key: "tts:ip:203.0.113.7", policy: ANON_POLICY });
  });

  it("buckets anonymous callers with no determinable IP under :noip", () => {
    expect(resolveRateLimit(null, req(), "tts", policies)).toEqual({
      key: "tts:ip:noip",
      policy: ANON_POLICY,
    });
  });
});
