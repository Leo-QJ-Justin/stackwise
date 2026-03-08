import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, stackItems } from "@/lib/db/schema";
import { eq, sql, isNull, and } from "drizzle-orm";
import { classifyAndStore, classifyTool } from "@/lib/classify";
import { fetchReadmeForPlugin } from "@/lib/github";
import fs from "fs";
import path from "path";
import os from "os";

function formatName(raw: string): string {
  const name = raw.split("@")[0];
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// POST /api/scan — scan for new tools and classify unclassified ones
export async function POST() {
  try {
    const home = os.homedir();
    let classifiedCount = 0;
    let insertedCount = 0;

    // 1. Scan installed_plugins.json for any new plugins
    const pluginsPath = path.join(home, ".claude", "plugins", "installed_plugins.json");
    if (fs.existsSync(pluginsPath)) {
      try {
        const raw = fs.readFileSync(pluginsPath, "utf-8");
        const data = JSON.parse(raw);
        const plugins = data.plugins && typeof data.plugins === "object" ? data.plugins : {};

        for (const key of Object.keys(plugins)) {
          const name = formatName(key);
          const existing = db
            .select()
            .from(toolsRegistry)
            .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' '))`)
            .get();

          if (!existing) {
            const readme = await fetchReadmeForPlugin(key);
            try {
              await classifyAndStore({
                name,
                readmeContent: readme ?? undefined,
                forceActive: true,
              });
              classifiedCount++;
            } catch (err) {
              console.error(`[scan] classification failed for new plugin "${name}":`, err);
              const [tool] = db.insert(toolsRegistry).values({
                name,
                status: "active",
                source: "community",
                category: "Development",
              }).returning().all();
              db.insert(stackItems).values({ toolId: tool.id }).run();
              insertedCount++;
            }
          }
        }
      } catch {
        // Ignore malformed JSON
      }
    }

    // 2. Reclassify existing tools that have no description (weren't classified)
    const unclassified = db
      .select()
      .from(toolsRegistry)
      .where(and(eq(toolsRegistry.status, "active"), isNull(toolsRegistry.description)))
      .all();

    for (const tool of unclassified) {
      // Try to find the plugin key for README lookup
      let readme: string | null = null;
      if (fs.existsSync(pluginsPath)) {
        try {
          const raw = fs.readFileSync(pluginsPath, "utf-8");
          const data = JSON.parse(raw);
          const plugins = data.plugins && typeof data.plugins === "object" ? data.plugins : {};
          // Find matching plugin key
          for (const key of Object.keys(plugins)) {
            if (formatName(key) === tool.name) {
              readme = await fetchReadmeForPlugin(key);
              break;
            }
          }
        } catch {
          // ignore
        }
      }

      try {
        const verdict = await classifyTool({
          name: tool.name,
          readmeContent: readme ?? undefined,
        });

        if (verdict) {
          db.update(toolsRegistry)
            .set({
              category: verdict.category,
              description: verdict.description,
              provides: verdict.provides ? JSON.stringify(verdict.provides) : null,
              verdictReason: verdict.reasoning,
              lastUpdated: sql`(CURRENT_TIMESTAMP)`,
            })
            .where(eq(toolsRegistry.id, tool.id))
            .run();

          classifiedCount++;
        }
      } catch (err) {
        console.error(`[scan] reclassification failed for "${tool.name}":`, err);
      }
    }

    return NextResponse.json({
      classified: classifiedCount,
      inserted: insertedCount,
      message: `Scan complete. ${classifiedCount} classified, ${insertedCount} inserted without classification.`,
    });
  } catch (error) {
    console.error("[scan] error:", error);
    return NextResponse.json(
      { error: "Scan failed" },
      { status: 500 }
    );
  }
}
