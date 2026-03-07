import { db } from "./index";
import { toolsRegistry, stackItems } from "./schema";

const seedTools = [
  {
    name: "Superpowers",
    category: "Development",
    pluginType: "skills_only",
    description: "Enforces structured coding workflows with plan-before-code discipline",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/obra/superpowers",
  },
  {
    name: "Claude-Mem",
    category: "Prompting & Context",
    pluginType: "capability",
    description: "Persistent cross-session memory for schema, conventions, and decisions",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/thedotmack/claude-mem",
  },
  {
    name: "Context7",
    category: "Research & Knowledge",
    pluginType: "capability",
    description: "Up-to-date library documentation lookup via MCP",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/anthropics/claude-code",
  },
  {
    name: "Planning with Files",
    category: "Development",
    pluginType: "skills_only",
    description: "Manus-style file-based planning with task tracking and session recovery",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/OthmanAdi/planning-with-files",
  },
  {
    name: "Document Skills",
    category: "Skills & File Handling",
    pluginType: "hybrid",
    description: "PDF, DOCX, XLSX, PPTX handling plus frontend design and skill creation",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/anthropics/skills",
  },
  {
    name: "PR Review Toolkit",
    category: "Development",
    pluginType: "capability",
    description: "Comprehensive PR review with specialized code review agents",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/anthropics/claude-code",
  },
  {
    name: "BMAD Method",
    category: "Development",
    pluginType: "hybrid",
    description: "Breakthrough Method of Agile AI-Driven Development framework",
    status: "queue",
    source: "community",
  },
  {
    name: "Roo Code Rules",
    category: "Prompting & Context",
    pluginType: "skills_only",
    description: "Curated rule sets for Claude coding conventions",
    status: "queue",
    source: "community",
  },
  {
    name: "GSD",
    category: "Development",
    pluginType: "skills_only",
    description: "Get Stuff Done workflow enforcement plugin",
    status: "evaluated_rejected",
    source: "community",
    verdictReason: "Overlaps heavily with Superpowers, less maintained",
  },
];

const inserted = db.insert(toolsRegistry).values(seedTools).returning().all();
console.log(`Inserted ${inserted.length} tools`);

const activeTools = inserted.filter((t) => t.status === "active");
const stackEntries = activeTools.map((tool) => ({
  toolId: tool.id,
}));

if (stackEntries.length > 0) {
  db.insert(stackItems).values(stackEntries).run();
  console.log(`Added ${stackEntries.length} items to stack`);
}

console.log("Seed complete.");
