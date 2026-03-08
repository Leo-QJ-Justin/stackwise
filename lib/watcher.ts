import chokidar, { type FSWatcher } from "chokidar";
import fs from "fs";
import os from "os";
import path from "path";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { toolsRegistry, stackItems } from "./db/schema";
import { classifyAndStore } from "./classify";
import { fetchReadmeForPlugin } from "./github";
import { getSetting } from "./settings";
import { getProvider } from "./shared";

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
  opts: { status: string; source: string; category: string }
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

      const apiKey = getSetting("api_key") || "";
      const providerId = getSetting("provider") ?? "openrouter";
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
          console.log(`[watcher] classified and added: "${name}"`);
        } catch (err) {
          console.error(`[watcher] classification failed for "${name}":`, err);
          // Fall back to basic insert
          ensureTool(name, {
            status: "active",
            source: "community",
            category: "Development",
          });
        }
      } else {
        // No API key — basic insert
        ensureTool(name, {
          status: "active",
          source: "community",
          category: "Development",
        });
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
      ignoreInitial: false,
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
