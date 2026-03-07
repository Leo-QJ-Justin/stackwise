/**
 * Derive a GitHub URL from a plugin key like "superpowers@claude-plugins-official"
 * and fetch the README content.
 */
export async function fetchReadmeForPlugin(
  pluginKey: string
): Promise<string | null> {
  const [name, org] = pluginKey.split("@");
  if (!name || !org) return null;

  // Try direct GitHub API
  const readmeUrl = `https://api.github.com/repos/${org}/${name}/readme`;
  try {
    const res = await fetch(readmeUrl, {
      headers: { Accept: "application/vnd.github.v3.raw" },
    });
    if (res.ok) {
      const text = await res.text();
      // Truncate to ~4000 chars to keep prompt size reasonable
      return text.slice(0, 4000);
    }
  } catch {}

  // Try GitHub search as fallback
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(name + " claude")}`;
  try {
    const res = await fetch(searchUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.items?.length > 0) {
        const repo = data.items[0];
        const repoReadmeUrl = `https://api.github.com/repos/${repo.full_name}/readme`;
        const readmeRes = await fetch(repoReadmeUrl, {
          headers: { Accept: "application/vnd.github.v3.raw" },
        });
        if (readmeRes.ok) {
          const text = await readmeRes.text();
          return text.slice(0, 4000);
        }
      }
    }
  } catch {}

  return null;
}
