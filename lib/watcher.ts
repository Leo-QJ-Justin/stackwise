import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import os from "os";
import path from "path";
import { sql, eq } from "drizzle-orm";
import { db } from "./db";
import { toolsRegistry, stackItems } from "./db/schema";
import { classifyAndStore } from "./classify";
import { fetchReadmeForPlugin } from "./github";
import { getSetting } from "./settings";
import { CATEGORIES, getProvider, inferCategory } from "./shared";

const pluginsJsonPath = path.join(
  os.homedir(),
  ".claude",
  "plugins",
  "installed_plugins.json"
);

const skillsGlob = path.join(os.homedir(), ".claude", "skills", "*", "SKILL.md");

/**
 * Split a kebab/snake-cased name on "-" and "_", capitalize each word,
 * and join with a space.  e.g. "my-cool-plugin" -> "My Cool Plugin"
 */
function formatName(raw: string): string {
  // Plugin keys are "name@publisher" — only use the name part
  const name = raw.split("@")[0];
  return name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Ensure a tool with the given name exists in tools_registry.
 * Returns early if one already exists.
 */
function ensureTool(
  name: string,
  opts: { status: string; source: string; category: string; pluginKey?: string }
) {
  const existing = db
    .select()
    .from(toolsRegistry)
    .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' '))`)
    .get();

  if (existing) return;

  const [tool] = db.insert(toolsRegistry)
    .values({
      name,
      status: opts.status,
      source: opts.source,
      category: opts.category,
      pluginKey: opts.pluginKey ?? null,
    })
    .returning()
    .all();

  if (opts.status === "active") {
    db.insert(stackItems).values({ toolId: tool.id }).run();
  }

  console.log(`[watcher] inserted tool: "${name}" (${opts.source})`);
}

// ── Plugins handler ────────────────────────────────────────────────

async function handlePluginsChange(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    if (!data.plugins || typeof data.plugins !== "object") {
      console.warn("[watcher] installed_plugins.json has no 'plugins' key");
      return;
    }

    const pluginKeys = Object.keys(data.plugins);

    for (const key of pluginKeys) {
      const name = formatName(key);

      // Check if already in registry (case-insensitive, normalize hyphens/spaces)
      const existing = db
        .select()
        .from(toolsRegistry)
        .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' '))`)
        .get();

      if (existing) continue;

      const providerId = getSetting("provider") ?? "openrouter";
      const apiKey = getSetting(`api_key:${providerId}`) || getSetting("api_key") || "";
      const providerConfig = getProvider(providerId);
      const hasClassifier = providerConfig && (!providerConfig.needsKey || apiKey);

      if (hasClassifier) {
        // Fetch README for context
        const readme = await fetchReadmeForPlugin(key);

        try {
          await classifyAndStore({
            name,
            readmeContent: readme ?? undefined,
            forceActive: true,
          });
          // Backfill pluginKey after classification
          db.update(toolsRegistry)
            .set({ pluginKey: key })
            .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' ')) AND ${toolsRegistry.pluginKey} IS NULL`)
            .run();
          console.log(`[watcher] classified and added: "${name}"`);
        } catch (err) {
          console.error(`[watcher] classification failed for "${name}":`, err);
          // Fall back to basic insert
          ensureTool(name, {
            status: "active",
            source: "installed",
            category: inferCategory(name),
            pluginKey: key,
          });
        }
      } else {
        // No API key — basic insert. Will be classified when API key is added and scan is run.
        ensureTool(name, {
          status: "active",
          source: "installed",
          category: "Unclassified",
          pluginKey: key,
        });
      }
    }

    // Detect uninstalled plugins: find installed tools not in current plugin list
    const currentPluginNames = new Set(
      pluginKeys.map((key) => formatName(key))
    );

    // Only check top-level plugins for uninstall detection.
    // Child capabilities (skills, commands, mcp_servers) are managed by the scan's reconcileChildren.
    const installedTools = db
      .select()
      .from(toolsRegistry)
      .where(sql`${toolsRegistry.source} = 'installed' AND ${toolsRegistry.status} = 'active' AND ${toolsRegistry.capabilityType} = 'plugin'`)
      .all();

    for (const tool of installedTools) {
      if (!currentPluginNames.has(tool.name)) {
        // Plugin was uninstalled — archive it and remove from stack
        db.update(toolsRegistry)
          .set({ status: "archived", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
          .where(eq(toolsRegistry.id, tool.id))
          .run();

        db.delete(stackItems)
          .where(eq(stackItems.toolId, tool.id))
          .run();

        console.log(`[watcher] archived uninstalled plugin: "${tool.name}"`);
      }
    }
  } catch (err) {
    console.error("[watcher] failed to process installed_plugins.json:", err);
  }
}

// ── Skills handlers ────────────────────────────────────────────────

function handleSkillAdd(filePath: string) {
  try {
    const skillDir = path.basename(path.dirname(filePath));
    const name = formatName(skillDir);

    ensureTool(name, {
      status: "unclassified",
      source: "self_created",
      category: CATEGORIES[0],
    });
  } catch (err) {
    console.error("[watcher] failed to process SKILL.md add:", err);
  }
}

function handleSkillUnlink(filePath: string) {
  try {
    const skillDir = path.basename(path.dirname(filePath));
    const name = formatName(skillDir);

    db.update(toolsRegistry)
      .set({ status: "archived" })
      .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${name}, '-', ' '))`)
      .run();

    console.log(`[watcher] archived skill: "${name}"`);
  } catch (err) {
    console.error("[watcher] failed to process SKILL.md unlink:", err);
  }
}

// ── Public entry point ─────────────────────────────────────────────

export function startWatcher() {
  const watchers: FSWatcher[] = [];

  // ── Watch installed_plugins.json ──────────────────────────────
  const pluginsDir = path.dirname(pluginsJsonPath);

  if (!fs.existsSync(pluginsDir)) {
    console.warn(
      `[watcher] plugins directory does not exist, skipping: ${pluginsDir}`
    );
  } else {
    const pluginWatcher = chokidar.watch(pluginsJsonPath, {
      persistent: true,
      ignoreInitial: false, // Read existing plugins on startup so new users get their tools auto-detected
    });

    const safePluginsHandler = (p: string) => {
      handlePluginsChange(p).catch((err) =>
        console.error("[watcher] unhandled error in plugins handler:", err)
      );
    };

    pluginWatcher
      .on("add", safePluginsHandler)
      .on("change", safePluginsHandler)
      .on("error", (err) =>
        console.error("[watcher] plugins watcher error:", err)
      );

    watchers.push(pluginWatcher);
    console.log("[watcher] watching installed_plugins.json");
  }

  // ── Watch SKILL.md files ──────────────────────────────────────
  const skillsDir = path.join(os.homedir(), ".claude", "skills");

  if (!fs.existsSync(skillsDir)) {
    console.warn(
      `[watcher] skills directory does not exist, skipping: ${skillsDir}`
    );
  } else {
    const skillWatcher = chokidar.watch(skillsGlob, {
      persistent: true,
      ignoreInitial: false,
    });

    skillWatcher
      .on("add", handleSkillAdd)
      .on("unlink", handleSkillUnlink)
      .on("error", (err) =>
        console.error("[watcher] skills watcher error:", err)
      );

    watchers.push(skillWatcher);
    console.log("[watcher] watching SKILL.md files");
  }

  return watchers;
}
