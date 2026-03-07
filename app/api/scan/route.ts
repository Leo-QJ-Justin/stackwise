import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import os from "os";

// POST /api/scan — scan local files for new tools, insert unclassified entries
export async function POST() {
  try {
    const home = os.homedir();
    let insertedCount = 0;

    // Get existing tool names to avoid duplicates
    const existingTools = await db.select({ name: toolsRegistry.name }).from(toolsRegistry);
    const existingNames = new Set(existingTools.map((t) => t.name));

    // 1. Scan ~/.claude/plugins/installed_plugins.json
    const pluginsPath = path.join(home, ".claude", "plugins", "installed_plugins.json");
    if (fs.existsSync(pluginsPath)) {
      try {
        const raw = fs.readFileSync(pluginsPath, "utf-8");
        const plugins: Array<{ name?: string; description?: string; type?: string }> = JSON.parse(raw);

        for (const plugin of plugins) {
          const name = plugin.name ?? "unknown_plugin";
          if (!existingNames.has(name)) {
            await db.insert(toolsRegistry).values({
              name,
              category: "plugin",
              provides: plugin.type ? JSON.stringify([plugin.type]) : null,
              description: plugin.description ?? null,
              status: "unclassified",
              source: "scan",
            });
            existingNames.add(name);
            insertedCount++;
          }
        }
      } catch {
        // Ignore malformed JSON
      }
    }

    // 2. Scan ~/.claude/skills/ directory
    const skillsDir = path.join(home, ".claude", "skills");
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.isDirectory()
          ? entry.name
          : path.parse(entry.name).name;

        if (!existingNames.has(name)) {
          await db.insert(toolsRegistry).values({
            name,
            category: "skill",
            description: null,
            status: "unclassified",
            source: "scan",
          });
          existingNames.add(name);
          insertedCount++;
        }
      }
    }

    return NextResponse.json({
      inserted: insertedCount,
      message: `Scan complete. ${insertedCount} new tool(s) added.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 }
    );
  }
}
