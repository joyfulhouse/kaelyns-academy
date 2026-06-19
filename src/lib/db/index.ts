import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  // Timeouts (seconds) so stale sockets are recycled after a CNPG failover /
  // rolling restart instead of throwing ECONNRESET on first reuse.
  _client = postgres(getEnv("DATABASE_URL"), {
    max: 5,
    prepare: false,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
  });
  _db = drizzle(_client, { schema });
  return _db;
}

export { schema };
