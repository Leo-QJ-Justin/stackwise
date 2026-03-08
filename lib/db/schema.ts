import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const toolsRegistry = sqliteTable("tools_registry", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  provides: text("provides"),
  description: text("description"),
  status: text("status").notNull().default("unclassified"),
  source: text("source").notNull().default("community"),
  verdictReason: text("verdict_reason"),
  firstSeen: text("first_seen")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  timesMentioned: integer("times_mentioned").notNull().default(1),
  lastUpdated: text("last_updated")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  canonicalUrl: text("canonical_url"),
  replacesToolId: integer("replaces_tool_id"),
});

export const stackItems = sqliteTable("stack_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  toolId: integer("tool_id")
    .notNull()
    .references(() => toolsRegistry.id),
  notes: text("notes"),
  addedAt: text("added_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const ingestedContent = sqliteTable("ingested_content", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceUrl: text("source_url"),
  postType: text("post_type"),
  rawText: text("raw_text"),
  claudeVerdict: text("claude_verdict"),
  mappedToToolId: integer("mapped_to_tool_id").references(
    () => toolsRegistry.id
  ),
  processedAt: text("processed_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const duplicatesLog = sqliteTable("duplicates_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contentId: integer("content_id").references(() => ingestedContent.id),
  verdict: text("verdict").notNull(),
  mappedToName: text("mapped_to_name"),
  reason: text("reason"),
  reviewed: integer("reviewed").notNull().default(0),
  loggedAt: text("logged_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const swapHistory = sqliteTable("swap_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  oldToolId: integer("old_tool_id").references(() => toolsRegistry.id),
  newToolId: integer("new_tool_id").references(() => toolsRegistry.id),
  reason: text("reason"),
  swappedAt: text("swapped_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type InsertTool = typeof toolsRegistry.$inferInsert;
export type SelectTool = typeof toolsRegistry.$inferSelect;
export type InsertStackItem = typeof stackItems.$inferInsert;
export type SelectStackItem = typeof stackItems.$inferSelect;
export type InsertSwap = typeof swapHistory.$inferInsert;
export type InsertIngestedContent = typeof ingestedContent.$inferInsert;
export type SelectIngestedContent = typeof ingestedContent.$inferSelect;
export type InsertDuplicatesLog = typeof duplicatesLog.$inferInsert;
export type SelectDuplicatesLog = typeof duplicatesLog.$inferSelect;
