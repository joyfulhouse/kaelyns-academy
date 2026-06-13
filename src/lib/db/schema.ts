import { pgTable, serial, timestamp, text } from "drizzle-orm/pg-core";

export const healthCheck = pgTable("health_check", {
  id: serial("id").primaryKey(),
  note: text("note").notNull().default("ok"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export * from "./auth-schema";
