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
    emailAndPassword: { enabled: true },
  }) as Auth<BetterAuthOptions>;
  return _auth;
}
