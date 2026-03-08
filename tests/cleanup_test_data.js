#!/usr/bin/env node
// Hard-deletes all test artifacts from the database.
// Called automatically at the end of test scripts.
const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "..", "db", "stack.db");
const db = new Database(dbPath);

const testTools = db
  .prepare(
    "SELECT id, name FROM tools_registry WHERE name LIKE '__test%' OR name LIKE '__lifecycle%' OR name LIKE '__stack%' OR name LIKE '__swap%' OR name LIKE 'xxxx%'"
  )
  .all();

const ids = testTools.map((t) => t.id);

if (ids.length > 0) {
  const ph = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM swap_history WHERE old_tool_id IN (${ph}) OR new_tool_id IN (${ph})`).run(...ids, ...ids);
  db.prepare(`DELETE FROM stack_items WHERE tool_id IN (${ph})`).run(...ids);
  db.prepare(`DELETE FROM ingested_content WHERE mapped_to_tool_id IN (${ph})`).run(...ids);
  db.prepare(`DELETE FROM tools_registry WHERE id IN (${ph})`).run(...ids);
  console.log(`Cleaned up ${ids.length} test tools: ${testTools.map((t) => t.name).join(", ")}`);
} else {
  console.log("No test artifacts to clean up");
}

db.close();
