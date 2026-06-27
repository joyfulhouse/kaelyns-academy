import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";

/**
 * Build the Better Auth instance. Factored out so `_auth` and getAuth() share the
 * exact INFERRED type: the `user.additionalFields.role` literal is no longer
 * assignable to the generic `Auth<BetterAuthOptions>`, and consumers
 * (`.api.getSession`, `toNextJsHandler`) want the precise instance type anyway, so
 * there is no lossy cast. Still lazy — getDb()/getEnv() run only when called, never
 * at module top level, so `next build` without DATABASE_URL stays green.
 */
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    secret: getEnv("BETTER_AUTH_SECRET"),
    baseURL: getEnv("BETTER_AUTH_URL", "http://localhost:3000"),
    // CSRF: same-origin only. Better Auth trusts `baseURL`'s origin by default;
    // the app is a single domain (kaelyns.academy / localhost in dev), so no
    // extra trusted origins are needed. Keep this explicit so adding one later
    // is a deliberate change, not an accidental default.
    user: {
      additionalFields: {
        // P4 admin authorization. `input: false` is the privilege-escalation
        // guard: the field is server-only, so a sign-up/update payload can never
        // set role:"admin". New accounts default to "user" (the DB DEFAULT is the
        // backstop); the admin role is granted only by scripts/seed-admin-roles.ts
        // from the ADMIN_EMAILS allowlist. requireAdmin() reads it authoritatively
        // from the user row, never from the allowlist at request time.
        role: { type: "string", required: false, defaultValue: "user", input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      // Parent-set passwords. 8 is Better Auth's default and matches the client
      // validation; pinned here so the policy is explicit, not implicit.
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Email verification is intentionally OFF until an email transport exists
      // (P4 Stage 2). Turning it on without `sendVerificationEmail` wired would
      // lock out every new parent at sign-up. The P4 role gate (requireAdmin reads
      // the `role` column) closes the admin self-register vector independently of
      // verification; revisit this flag when transactional email lands.
      requireEmailVerification: false,
    },
  });
}

let _auth: ReturnType<typeof createAuth> | null = null;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!_auth) _auth = createAuth();
  return _auth;
}
