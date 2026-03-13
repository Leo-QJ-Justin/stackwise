import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, stackItems } from "@/lib/db/schema";
import { eq, sql, isNull, and } from "drizzle-orm";
import { classifyAndStore, classifyToolMetadata, compareToStack, type StackVerdict } from "@/lib/classify";
import { fetchReadmeForPlugin } from "@/lib/github";
import { parseFrontmatter } from "@/lib/frontmatter";
import { inferCategory } from "@/lib/shared";
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

/**
 * Resolve the installPath for a plugin entry from installed_plugins.json.
 * If multiple installs exist, pick the most recently updated one.
 */
function resolveInstallPath(pluginEntry: unknown): string | null {
  if (Array.isArray(pluginEntry)) {
    // v2 format: array of installations
    let best: { installPath: string; lastUpdated: string } | null = null;
    for (const entry of pluginEntry) {
      if (entry && typeof entry === "object" && "installPath" in entry) {
        const e = entry as { installPath: string; lastUpdated?: string };
        if (!best || (e.lastUpdated && (!best.lastUpdated || e.lastUpdated > best.lastUpdated))) {
          best = { installPath: e.installPath, lastUpdated: e.lastUpdated ?? "" };
        }
      }
    }
    return best?.installPath ?? null;
  }
  if (pluginEntry && typeof pluginEntry === "object" && "installPath" in pluginEntry) {
    return (pluginEntry as { installPath: string }).installPath;
  }
  return null;
}

/**
 * Discover child skills, commands, and bundled MCP servers within a plugin's installPath.
 */
function discoverPluginChildren(
  installPath: string,
  parentId: number,
  parentCategory: string,
  send: (event: Record<string, unknown>) => void,
  parentName: string,
): number {
  let discovered = 0;

  // a. Discover skills from skills/ directory
  const skillsDir = path.join(installPath, "skills");
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    try {
      const skillFolders = fs.readdirSync(skillsDir);
      for (const folder of skillFolders) {
        const skillMdPath = path.join(skillsDir, folder, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;

        try {
          const content = fs.readFileSync(skillMdPath, "utf-8");
          const fm = parseFrontmatter(content);
          const skillName = fm.name || folder; // fallback to directory name
          const description = typeof fm.description === "string" ? fm.description : "";

          // Check for existing child entry
          const existing = db
            .select()
            .from(toolsRegistry)
            .where(
              and(
                eq(toolsRegistry.parentPluginId, parentId),
                sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${skillName}, '-', ' '))`,
              )
            )
            .get();

          if (existing) {
            // Update existing entry (plugin may have been updated) and ensure it's active
            db.update(toolsRegistry)
              .set({
                skillPath: skillMdPath,
                frontmatter: JSON.stringify(fm),
                description,
                status: "active",
                lastUpdated: sql`(CURRENT_TIMESTAMP)`,
              })
              .where(eq(toolsRegistry.id, existing.id))
              .run();
            send({ type: "skill-updated", plugin: parentName, skill: skillName, changes: ["description"] });
          } else {
            db.insert(toolsRegistry)
              .values({
                name: skillName,
                category: inferCategory(skillName, description) !== "Unclassified"
                  ? inferCategory(skillName, description)
                  : parentCategory,
                capabilityType: "skill",
                parentPluginId: parentId,
                skillPath: skillMdPath,
                frontmatter: JSON.stringify(fm),
                description,
                status: "active",
                source: "installed",
              })
              .run();
            send({ type: "skill-discovered", plugin: parentName, skill: skillName, capabilityType: "skill" });
            discovered++;
          }
        } catch (err) {
          console.warn(`[scan] malformed frontmatter in ${skillMdPath}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[scan] failed to read skills directory ${skillsDir}:`, err);
    }
  }

  // b. Discover commands from commands/ directory
  const commandsDir = path.join(installPath, "commands");
  if (fs.existsSync(commandsDir) && fs.statSync(commandsDir).isDirectory()) {
    try {
      const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
      for (const file of commandFiles) {
        const cmdPath = path.join(commandsDir, file);
        try {
          const content = fs.readFileSync(cmdPath, "utf-8");
          const fm = parseFrontmatter(content);
          const cmdName = fm.name || file.replace(/\.md$/, ""); // fallback to filename
          const description = typeof fm.description === "string" ? fm.description : "";

          const existing = db
            .select()
            .from(toolsRegistry)
            .where(
              and(
                eq(toolsRegistry.parentPluginId, parentId),
                sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${cmdName}, '-', ' '))`,
              )
            )
            .get();

          if (existing) {
            db.update(toolsRegistry)
              .set({
                skillPath: cmdPath,
                frontmatter: JSON.stringify(fm),
                description,
                status: "active",
                lastUpdated: sql`(CURRENT_TIMESTAMP)`,
              })
              .where(eq(toolsRegistry.id, existing.id))
              .run();
          } else {
            db.insert(toolsRegistry)
              .values({
                name: cmdName,
                category: inferCategory(cmdName, description) !== "Unclassified"
                  ? inferCategory(cmdName, description)
                  : parentCategory,
                capabilityType: "command",
                parentPluginId: parentId,
                skillPath: cmdPath,
                frontmatter: JSON.stringify(fm),
                description,
                status: "active",
                source: "installed",
              })
              .run();
            send({ type: "skill-discovered", plugin: parentName, skill: cmdName, capabilityType: "command" });
            discovered++;
          }
        } catch (err) {
          console.warn(`[scan] malformed frontmatter in ${cmdPath}:`, err);
        }
      }
    } catch (err) {
      console.warn(`[scan] failed to read commands directory ${commandsDir}:`, err);
    }
  }

  // c. Discover bundled MCP servers from .mcp.json
  const bundledMcpPath = path.join(installPath, ".mcp.json");
  if (fs.existsSync(bundledMcpPath)) {
    try {
      const raw = fs.readFileSync(bundledMcpPath, "utf-8");
      const data = JSON.parse(raw);
      const servers = data.mcpServers && typeof data.mcpServers === "object" ? data.mcpServers : {};

      for (const serverName of Object.keys(servers)) {
        const existing = db
          .select()
          .from(toolsRegistry)
          .where(
            and(
              eq(toolsRegistry.parentPluginId, parentId),
              sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${serverName}, '-', ' '))`,
            )
          )
          .get();

        if (!existing) {
          const mcpDesc = `Bundled MCP server from ${parentName}`;
          db.insert(toolsRegistry)
            .values({
              name: serverName,
              category: inferCategory(serverName, mcpDesc) !== "Unclassified"
                ? inferCategory(serverName, mcpDesc)
                : parentCategory,
              capabilityType: "mcp_server",
              parentPluginId: parentId,
              description: mcpDesc,
              status: "active",
              source: "installed",
            })
            .run();
          send({ type: "skill-discovered", plugin: parentName, skill: serverName, capabilityType: "mcp_server" });
          discovered++;
        }
      }
    } catch (err) {
      console.warn(`[scan] failed to read bundled .mcp.json at ${bundledMcpPath}:`, err);
    }
  }

  return discovered;
}

/**
 * Reconcile discovered children against DB — mark skills removed from disk as archived.
 */
function reconcileChildren(
  parentId: number,
  installPath: string,
  send: (event: Record<string, unknown>) => void,
  parentName: string,
) {
  const children = db
    .select()
    .from(toolsRegistry)
    .where(and(
      eq(toolsRegistry.parentPluginId, parentId),
      eq(toolsRegistry.status, "active"),
    ))
    .all();

  for (const child of children) {
    // Check if the child still exists on disk
    if (child.skillPath && !fs.existsSync(child.skillPath)) {
      db.update(toolsRegistry)
        .set({ status: "archived", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
        .where(eq(toolsRegistry.id, child.id))
        .run();

      // Remove from stack_items
      db.delete(stackItems)
        .where(eq(stackItems.toolId, child.id))
        .run();

      send({ type: "skill-archived", plugin: parentName, skill: child.name });
    }
  }
}


// GET /api/scan — return count of tools needing classification
export async function GET() {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(toolsRegistry)
    .where(and(
      eq(toolsRegistry.status, "active"),
      isNull(toolsRegistry.description),
      eq(toolsRegistry.capabilityType, "plugin"),
    ))
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
      let closed = false;
      function send(event: Record<string, unknown>) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      }

      let classifiedCount = 0;
      let insertedCount = 0;
      let skillsDiscovered = 0;

      // Send heartbeat every 10s to prevent connection timeout during long LLM calls
      const heartbeat = setInterval(() => {
        send({ type: "heartbeat" });
      }, 10_000);

      try {
        // ── Phase 1: Scan installed_plugins.json ─────────────────────
        // Register plugin-level entries and drill into each for child discovery
        if (fs.existsSync(pluginsPath)) {
          try {
            const raw = fs.readFileSync(pluginsPath, "utf-8");
            const data = JSON.parse(raw);
            const plugins = data.plugins && typeof data.plugins === "object" ? data.plugins : {};

            for (const key of Object.keys(plugins)) {
              const name = formatName(key);
              let existing = db
                .select()
                .from(toolsRegistry)
                .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' ')) AND ${toolsRegistry.capabilityType} = 'plugin'`)
                .get();

              if (!existing) {
                send({ type: "classifying", name });
                const readme = await fetchReadmeForPlugin(key);
                try {
                  const result = await classifyAndStore({
                    name,
                    readmeContent: readme ?? undefined,
                    forceActive: true,
                  });
                  // classifyAndStore returns { tool, verdict } — get the inserted tool
                  existing = db
                    .select()
                    .from(toolsRegistry)
                    .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' '))`)
                    .get();
                  classifiedCount++;
                  send({ type: "classified", name });
                } catch (err) {
                  console.error(`[scan] classification failed for new plugin "${name}":`, err);
                  const [tool] = db.insert(toolsRegistry).values({
                    name,
                    status: "active",
                    source: "community",
                    category: inferCategory(name),
                    capabilityType: "plugin",
                  }).returning().all();
                  db.insert(stackItems).values({ toolId: tool.id }).run();
                  existing = tool;
                  insertedCount++;
                  send({ type: "fallback", name, reason: err instanceof Error ? err.message : String(err) });
                }
              } else {
                // Ensure existing plugin has capability_type set (backfill from before migration)
                if (existing.capabilityType !== "plugin") {
                  db.update(toolsRegistry)
                    .set({ capabilityType: "plugin" })
                    .where(eq(toolsRegistry.id, existing.id))
                    .run();
                }
              }

              // ── Drill into plugin installPath for child discovery ──
              if (existing) {
                const installPath = resolveInstallPath(plugins[key]);
                if (installPath && fs.existsSync(installPath)) {
                  const found = discoverPluginChildren(
                    installPath,
                    existing.id,
                    existing.category,
                    send,
                    name,
                  );
                  skillsDiscovered += found;

                  // Reconcile: mark children removed from disk as archived
                  reconcileChildren(existing.id, installPath, send, name);
                } else if (installPath) {
                  console.warn(`[scan] installPath not found for "${name}": ${installPath}`);
                }
              }
            }
          } catch (parseErr) {
            console.error("[scan] Failed to parse installed_plugins.json:", parseErr);
            send({ type: "error", error: `Failed to parse plugins file: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` });
          }
        }

        // ── Phase 2: Scan standalone MCP servers from ~/.claude/.mcp.json ──
        const mcpPath = path.join(home, ".claude", ".mcp.json");
        if (fs.existsSync(mcpPath)) {
          try {
            const raw = fs.readFileSync(mcpPath, "utf-8");
            const data = JSON.parse(raw);
            const servers = data.mcpServers && typeof data.mcpServers === "object" ? data.mcpServers : {};

            for (const key of Object.keys(servers)) {
              const name = formatName(key);
              const existing = db
                .select()
                .from(toolsRegistry)
                .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' ')) AND ${toolsRegistry.parentPluginId} IS NULL`)
                .get();

              if (!existing) {
                send({ type: "classifying", name });

                // Try to extract npm package name from args for README lookup
                const args = servers[key]?.args as string[] | undefined;
                const pkgArg = args?.find((a: string) => !a.startsWith("-") && a !== "-y");
                const readme = pkgArg ? await fetchReadmeForPlugin(pkgArg) : null;

                try {
                  await classifyAndStore({
                    name,
                    readmeContent: readme ?? undefined,
                    forceActive: true,
                  });
                  // Backfill: set capability_type to mcp_server for newly classified
                  db.update(toolsRegistry)
                    .set({ capabilityType: "mcp_server" })
                    .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' ')) AND ${toolsRegistry.parentPluginId} IS NULL`)
                    .run();
                  classifiedCount++;
                  send({ type: "classified", name });
                } catch (err) {
                  console.error(`[scan] classification failed for MCP server "${name}":`, err);
                  const [tool] = db.insert(toolsRegistry).values({
                    name,
                    status: "active",
                    source: "community",
                    category: "Integrations",
                    capabilityType: "mcp_server",
                  }).returning().all();
                  db.insert(stackItems).values({ toolId: tool.id }).run();
                  insertedCount++;
                  send({ type: "fallback", name, reason: err instanceof Error ? err.message : String(err) });
                }
              } else if (existing.capabilityType !== "mcp_server") {
                // Backfill: update existing MCP server entries that had default capability_type
                db.update(toolsRegistry)
                  .set({ capabilityType: "mcp_server" })
                  .where(eq(toolsRegistry.id, existing.id))
                  .run();
              }
            }
          } catch (parseErr) {
            console.error("[scan] Failed to parse .mcp.json:", parseErr);
            send({ type: "error", error: `Failed to parse MCP config: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` });
          }
        }

        // ── Phase 3: Backfill user-created skills ──
        db.update(toolsRegistry)
          .set({ capabilityType: "skill" })
          .where(and(
            eq(toolsRegistry.source, "self_created"),
            eq(toolsRegistry.capabilityType, "plugin"),
          ))
          .run();

        // ── Phase 4: Reclassify active plugin-level tools missing metadata ──
        const unclassified = db
          .select()
          .from(toolsRegistry)
          .where(and(
            eq(toolsRegistry.status, "active"),
            isNull(toolsRegistry.description),
            eq(toolsRegistry.capabilityType, "plugin"),
          ))
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
            } catch (readmeErr) {
              console.warn(`[scan] Failed to read plugins file for README lookup of "${tool.name}":`, readmeErr);
            }
          }

          try {
            // Step 1: Discover
            const meta = await classifyToolMetadata({
              name: tool.name,
              readmeContent: readme ?? undefined,
            });

            // Step 2: Compare
            let verdict: StackVerdict | null = null;
            try {
              verdict = await compareToStack({
                name: tool.name,
                category: meta.category,
                description: meta.description,
                provides: meta.provides,
              });
            } catch (cmpErr) {
              const msg = cmpErr instanceof Error ? cmpErr.message : String(cmpErr);
              if (msg.includes("SQLITE") || msg.includes("Unknown provider") || msg.includes("No API key configured")) {
                throw cmpErr;
              }
              console.warn(`[scan] stack comparison failed for "${tool.name}":`, cmpErr);
              send({ type: "warning", name: tool.name, warning: `Stack comparison failed: ${msg}` });
            }

            db.update(toolsRegistry)
              .set({
                category: meta.category,
                description: meta.description,
                provides: JSON.stringify(meta.provides),
                verdictReason: verdict?.reasoning ?? "Metadata classified (no stack comparison)",
                lastUpdated: sql`(CURRENT_TIMESTAMP)`,
              })
              .where(eq(toolsRegistry.id, tool.id))
              .run();

            classifiedCount++;
            send({ type: "classified", name: tool.name, category: meta.category });
          } catch (err) {
            console.error(`[scan] reclassification failed for "${tool.name}":`, err);
            send({ type: "error", name: tool.name, error: String(err instanceof Error ? err.message : err) });
          }
        }

        send({
          type: "done",
          classified: classifiedCount,
          inserted: insertedCount,
          skillsDiscovered,
        });
      } catch (error) {
        console.error("[scan] error:", error);
        send({ type: "error", error: `Scan failed: ${error instanceof Error ? error.message : String(error)}` });
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          try { controller.close(); } catch { /* already closed */ }
        }
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
