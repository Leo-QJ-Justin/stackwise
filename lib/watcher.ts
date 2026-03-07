import chokidar from "chokidar";
import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { toolsRegistry } from "./db/schema";

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
  return raw
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
  opts: { status: string; source: string; category: string }
) {
  const existing = db
    .select()
    .from(toolsRegistry)
    .where(eq(toolsRegistry.name, name))
    .get();

  if (existing) return;

  db.insert(toolsRegistry)
    .values({
      name,
      status: opts.status,
      source: opts.source,
      category: opts.category,
    })
    .run();

  console.log(`[watcher] inserted tool: "${name}" (${opts.source})`);
}

// ── Plugins handler ────────────────────────────────────────────────

function handlePluginsChange(filePath: string) {
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
      ensureTool(name, {
        status: "unclassified",
        source: "community",
        category: "Development",
      });
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
      category: "My Skills",
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
      .where(eq(toolsRegistry.name, name))
      .run();

    console.log(`[watcher] archived skill: "${name}"`);
  } catch (err) {
    console.error("[watcher] failed to process SKILL.md unlink:", err);
  }
}

// ── Public entry point ─────────────────────────────────────────────

export function startWatcher() {
  const watchers: chokidar.FSWatcher[] = [];

  // ── Watch installed_plugins.json ──────────────────────────────
  const pluginsDir = path.dirname(pluginsJsonPath);

  if (!fs.existsSync(pluginsDir)) {
    console.warn(
      `[watcher] plugins directory does not exist, skipping: ${pluginsDir}`
    );
  } else {
    const pluginWatcher = chokidar.watch(pluginsJsonPath, {
      persistent: true,
      ignoreInitial: false,
    });

    pluginWatcher
      .on("add", handlePluginsChange)
      .on("change", handlePluginsChange)
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
