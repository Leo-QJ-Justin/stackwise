// Shared domain types for StackWise

export type MergeType = "orchestrator" | "mutation";
export type CapabilityType = "plugin" | "skill" | "command" | "mcp_server";
export type ToolStatus = "active" | "unclassified" | "queue" | "evaluated_rejected";
export type ToolSource = "community" | "installed" | "self_created";

export const MERGE_TYPES: MergeType[] = ["orchestrator", "mutation"];

export function isValidMergeType(value: unknown): value is MergeType {
  return typeof value === "string" && MERGE_TYPES.includes(value as MergeType);
}

export function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => Number.isInteger(v));
}

// Shared graph data types (used by focus-graph, skill-detail-header)
export interface GraphNode {
  id: number;
  name: string;
  tier: number;
  mergeType: MergeType | null;
  position?: number;
  status?: string;
}

export interface GraphData {
  skill: GraphNode & {
    description: string | null;
    skillPath: string | null;
    generationPrompt: string | null;
    capabilityType: string;
    source: string;
    status: string;
  };
  dependsOn: GraphNode[];
  usedBy: GraphNode[];
}

// Shared skill list item (used by page.tsx, skills-sidebar.tsx)
export interface SkillListItem {
  id: number;
  name: string;
  tier: number;
  mergeType: MergeType | null;
  capabilityType: string;
  source: string;
  status: string;
  description: string | null;
  skillPath: string | null;
  generationPrompt: string | null;
  baseSkills: { id: number; name: string; position: number }[];
  usedByCount: number;
}

// Plugin group for hierarchical sidebar
export interface PluginGroup {
  id: number;
  name: string;
  skills: SkillListItem[];
}
