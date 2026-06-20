import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";

let _auth: Auth<BetterAuthOptions> | null = null;

export function getAuth(): Auth<BetterAuthOptions> {
  if (_auth) return _auth;
  _auth = betterAuth({
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    secret: getEnv("BETTER_AUTH_SECRET"),
    baseURL: getEnv("BETTER_AUTH_URL", "http://localhost:3000"),
    // CSRF: same-origin only. Better Auth trusts `baseURL`'s origin by default;
    // the app is a single domain (kaelyns.academy / localhost in dev), so no
    // extra trusted origins are needed. Keep this explicit so adding one later
    // is a deliberate change, not an accidental default.
    emailAndPassword: {
      enabled: true,
      // Parent-set passwords. 8 is Better Auth's default and matches the client
      // validation; pinned here so the policy is explicit, not implicit.
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Email verification is intentionally OFF until an email transport exists
      // (P4). Turning it on without `sendVerificationEmail` wired would lock out
      // every new parent at sign-up. Revisit when transactional email lands.
      requireEmailVerification: false,
    },
  }) as Auth<BetterAuthOptions>;
  return _auth;
}
