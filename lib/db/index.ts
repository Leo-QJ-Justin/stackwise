import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dbDir = path.resolve(process.cwd(), "db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.resolve(dbDir, "stack.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tools_registry (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    provides text,
    description text,
    status text NOT NULL DEFAULT 'unclassified',
    source text NOT NULL DEFAULT 'community',
    verdict_reason text,
    first_seen text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    times_mentioned integer NOT NULL DEFAULT 1,
    last_updated text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    canonical_url text,
    replaces_tool_id integer REFERENCES tools_registry(id),
    capability_type text NOT NULL DEFAULT 'plugin',
    parent_plugin_id integer,
    skill_path text,
    frontmatter text
  );
  CREATE TABLE IF NOT EXISTS stack_items (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    tool_id integer NOT NULL,
    notes text,
    added_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (tool_id) REFERENCES tools_registry(id)
  );
  CREATE TABLE IF NOT EXISTS ingested_content (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    source_url text,
    post_type text,
    raw_text text,
    claude_verdict text,
    mapped_to_tool_id integer,
    processed_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (mapped_to_tool_id) REFERENCES tools_registry(id)
  );
  CREATE TABLE IF NOT EXISTS duplicates_log (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    content_id integer,
    verdict text NOT NULL,
    mapped_to_name text,
    reason text,
    reviewed integer NOT NULL DEFAULT 0,
    logged_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (content_id) REFERENCES ingested_content(id)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY NOT NULL,
    value text
  );
  CREATE TABLE IF NOT EXISTS swap_history (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    old_tool_id integer,
    new_tool_id integer,
    reason text,
    swapped_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (old_tool_id) REFERENCES tools_registry(id),
    FOREIGN KEY (new_tool_id) REFERENCES tools_registry(id)
  );
  CREATE TABLE IF NOT EXISTS skill_compositions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    composite_skill_id integer NOT NULL,
    base_skill_id integer NOT NULL,
    position integer NOT NULL,
    added_at text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (composite_skill_id) REFERENCES tools_registry(id),
    FOREIGN KEY (base_skill_id) REFERENCES tools_registry(id),
    UNIQUE (composite_skill_id, base_skill_id),
    UNIQUE (composite_skill_id, position)
  );
`);

// Migrate existing databases: add new columns for skill discovery
const newColumns = [
  "ALTER TABLE tools_registry ADD COLUMN capability_type text NOT NULL DEFAULT 'plugin'",
  "ALTER TABLE tools_registry ADD COLUMN parent_plugin_id integer",
  "ALTER TABLE tools_registry ADD COLUMN skill_path text",
  "ALTER TABLE tools_registry ADD COLUMN frontmatter text",
  "ALTER TABLE tools_registry ADD COLUMN merge_type text",
  "ALTER TABLE tools_registry ADD COLUMN tier integer NOT NULL DEFAULT 0",
  "ALTER TABLE tools_registry ADD COLUMN generation_prompt text",
  "ALTER TABLE tools_registry ADD COLUMN plugin_key text",
];
for (const ddl of newColumns) {
  try {
    sqlite.exec(ddl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate column name")) {
      console.error(`[db/migration] DDL failed: ${ddl}`, err);
      throw err;
    }
  }
}

// Fix: re-activate child capabilities (skills, commands, mcp_servers) that were
// incorrectly archived by the watcher's uninstall detection before the fix.
sqlite.exec(`
  UPDATE tools_registry
  SET status = 'active', last_updated = CURRENT_TIMESTAMP
  WHERE status = 'archived'
    AND capability_type IN ('skill', 'command', 'mcp_server')
    AND parent_plugin_id IS NOT NULL
    AND parent_plugin_id IN (
      SELECT id FROM tools_registry WHERE status = 'active' AND capability_type = 'plugin'
    )
    AND skill_path IS NOT NULL
`);

// Seed default settings if empty (first run)
const hasSettings = sqlite.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
if (hasSettings.count === 0) {
  sqlite.exec(`
    INSERT INTO settings (key, value) VALUES
      ('provider', 'openrouter'),
      ('api_key', ''),
      ('model', 'anthropic/claude-sonnet-4'),
      ('search_model', 'perplexity/sonar');
  `);
}

export const db = drizzle(sqlite, { schema });
