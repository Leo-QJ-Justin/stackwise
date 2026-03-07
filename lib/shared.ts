export const CATEGORIES = [
  "Development",
  "Skills & File Handling",
  "Integrations",
  "Workflow & Agents",
  "Prompting & Context",
  "Research & Knowledge",
  "UI & Frontend",
  "My Skills",
] as const;

export function parseProvides(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
