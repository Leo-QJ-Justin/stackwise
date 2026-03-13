/**
 * Parse YAML frontmatter from a skill/command .md file.
 * Expects content between `---` delimiters at the top of the file.
 * Uses simple regex parsing — no heavy YAML dependency needed.
 */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yamlBlock = match[1];
  const result: Record<string, unknown> = {};

  for (const line of yamlBlock.split("\n")) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value: unknown = kvMatch[2].trim();

    // Strip surrounding quotes
    if (
      typeof value === "string" &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    // Handle YAML arrays like [tool1, tool2]
    if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }

    result[key] = value;
  }

  return result as SkillFrontmatter;
}
