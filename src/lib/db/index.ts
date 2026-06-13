import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  _client = postgres(getEnv("DATABASE_URL"), { max: 5, prepare: false });
  _db = drizzle(_client, { schema });
  return _db;
}

export { schema };
