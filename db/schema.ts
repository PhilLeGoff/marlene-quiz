import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(0),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: integer("expires").notNull(),
});
export const scoreEvents = sqliteTable("score_events", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});
