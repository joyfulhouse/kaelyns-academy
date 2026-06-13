import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. Talks to the server handler mounted at
 * `/api/auth/[...all]`. We leave `baseURL` unset so it resolves relative to the
 * current origin, which keeps it correct across localhost, preview, and the
 * deployed `kaelyns.academy` host without per-environment config. The matching
 * server secrets (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) are read lazily in
 * `@/lib/auth`, never here.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
