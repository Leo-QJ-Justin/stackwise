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

// GET /api/scan — return count of tools needing classification
export async function GET() {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(toolsRegistry)
    .where(and(eq(toolsRegistry.status, "active"), isNull(toolsRegistry.verdictReason)))
    .get();

  return NextResponse.json({ unclassifiedCount: row?.count ?? 0 });
}

// POST /api/scan — scan for new tools and classify unclassified ones (streaming)
export async function POST() {
  const encoder = new TextEncoder();
  const home = os.homedir();
  const pluginsPath = path.join(home, ".claude", "plugins", "installed_plugins.json");

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      let classifiedCount = 0;
      let insertedCount = 0;

      try {
        // 1. Scan installed_plugins.json for any new plugins
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
                send({ type: "classifying", name });
                const readme = await fetchReadmeForPlugin(key);
                try {
                  await classifyAndStore({
                    name,
                    readmeContent: readme ?? undefined,
                    forceActive: true,
                  });
                  classifiedCount++;
                  send({ type: "classified", name });
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
                  send({ type: "fallback", name });
                }
              }
            }
          } catch {
            // Ignore malformed JSON
          }
        }

        // 2. Reclassify existing tools that have no verdictReason (weren't classified)
        const unclassified = db
          .select()
          .from(toolsRegistry)
          .where(and(eq(toolsRegistry.status, "active"), isNull(toolsRegistry.verdictReason)))
          .all();

        send({ type: "phase", phase: "reclassify", total: unclassified.length });

        for (const tool of unclassified) {
          send({ type: "classifying", name: tool.name });

          // Try to find the plugin key for README lookup
          let readme: string | null = null;
          if (fs.existsSync(pluginsPath)) {
            try {
              const raw = fs.readFileSync(pluginsPath, "utf-8");
              const data = JSON.parse(raw);
              const plugins = data.plugins && typeof data.plugins === "object" ? data.plugins : {};
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
              send({ type: "classified", name: tool.name, category: verdict.category });
            }
          } catch (err) {
            console.error(`[scan] reclassification failed for "${tool.name}":`, err);
            send({ type: "error", name: tool.name, error: String(err instanceof Error ? err.message : err) });
          }
        }

        send({
          type: "done",
          classified: classifiedCount,
          inserted: insertedCount,
        });
      } catch (error) {
        console.error("[scan] error:", error);
        send({ type: "error", error: "Scan failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
