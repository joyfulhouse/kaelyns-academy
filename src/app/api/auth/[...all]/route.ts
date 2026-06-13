// Per-request lazy init: getAuth() → getDb() reads DATABASE_URL at runtime, not
// at module-evaluation time, so `next build` without DATABASE_URL stays green.
import { getAuth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
