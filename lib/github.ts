import { getSetting } from "./settings";
import fs from "fs";
import path from "path";
import os from "os";

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
  };
  const token = getSetting("github_token");
  if (token) {
    headers.Authorization = `token ${token}`;
  }
  return headers;
}

/**
 * Try to read README from the local plugin cache before hitting GitHub.
 */
function readLocalReadme(pluginKey: string): string | null {
  const [name, org] = pluginKey.split("@");
  if (!name || !org) return null;

  const cacheDir = path.join(os.homedir(), ".claude", "plugins", "cache", org, name);
  try {
    if (!fs.existsSync(cacheDir)) return null;
    // Cache has version subdirectories — pick the first one
    const versions = fs.readdirSync(cacheDir);
    for (const ver of versions) {
      const readmePath = path.join(cacheDir, ver, "README.md");
      if (fs.existsSync(readmePath)) {
        const text = fs.readFileSync(readmePath, "utf-8");
        return text.slice(0, 4000);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Derive a GitHub URL from a plugin key like "superpowers@claude-plugins-official"
 * and fetch the README content. Checks local cache first.
 */
export async function fetchReadmeForPlugin(
  pluginKey: string
): Promise<string | null> {
  // 1. Check local plugin cache first (instant, no API calls)
  const local = readLocalReadme(pluginKey);
  if (local) return local;

  const [name, org] = pluginKey.split("@");
  if (!name || !org) return null;

  // 2. Try direct GitHub API
  const readmeUrl = `https://api.github.com/repos/${org}/${name}/readme`;
  try {
    const res = await fetch(readmeUrl, { headers: githubHeaders() });
    if (res.ok) {
      const text = await res.text();
      return text.slice(0, 4000);
    }
    if (res.status === 403) {
      console.warn("[github] Rate limited fetching README. Add a GitHub token in Settings.");
    }
  } catch (err) {
    console.warn(`[github] Failed to fetch README from ${readmeUrl}:`, err);
  }

  // 3. Try GitHub search as fallback
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(name + " claude")}`;
  try {
    const headers = githubHeaders();
    headers.Accept = "application/vnd.github.v3+json";
    const res = await fetch(searchUrl, { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.items?.length > 0) {
        const repo = data.items[0];
        const repoReadmeUrl = `https://api.github.com/repos/${repo.full_name}/readme`;
        const readmeRes = await fetch(repoReadmeUrl, { headers: githubHeaders() });
        if (readmeRes.ok) {
          const text = await readmeRes.text();
          return text.slice(0, 4000);
        }
      }
    } else if (res.status === 403) {
      console.warn("[github] Rate limited on search fallback.");
    }
  } catch (err) {
    console.warn(`[github] Search fallback failed for "${name}":`, err);
  }

  return null;
}
