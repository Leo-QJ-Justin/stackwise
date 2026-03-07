import { eq } from "drizzle-orm";
import { db } from "./index";
import { toolsRegistry, stackItems, settings } from "./schema";

const seedTools = [
  {
    name: "Superpowers",
    category: "Development",
    provides: JSON.stringify(["14 skills (brainstorming, debugging, TDD, etc.)", "3 slash commands", "Session hooks"]),
    description: "Enforces structured coding workflows with plan-before-code discipline",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/obra/superpowers",
  },
  {
    name: "Claude-Mem",
    category: "Prompting & Context",
    provides: JSON.stringify(["Persistent cross-session memory", "Semantic search over past decisions", "Smart code outline via tree-sitter"]),
    description: "Persistent cross-session memory for schema, conventions, and decisions",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/thedotmack/claude-mem",
  },
  {
    name: "Context7",
    category: "Research & Knowledge",
    provides: JSON.stringify(["MCP server for library docs", "Up-to-date API references"]),
    description: "Up-to-date library documentation lookup via MCP",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/anthropics/claude-code",
  },
  {
    name: "Planning with Files",
    category: "Development",
    provides: JSON.stringify(["File-based task planning", "Session recovery after /clear", "Progress tracking"]),
    description: "Manus-style file-based planning with task tracking and session recovery",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/OthmanAdi/planning-with-files",
  },
  {
    name: "Document Skills",
    category: "Skills & File Handling",
    provides: JSON.stringify(["PDF/DOCX/XLSX/PPTX handling", "Frontend design skill", "Skill creation guide"]),
    description: "PDF, DOCX, XLSX, PPTX handling plus frontend design and skill creation",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/anthropics/skills",
  },
  {
    name: "PR Review Toolkit",
    category: "Development",
    provides: JSON.stringify(["Code review agent", "Silent failure hunter", "Type design analyzer", "Test coverage analyzer"]),
    description: "Comprehensive PR review with specialized code review agents",
    status: "active",
    source: "community",
    canonicalUrl: "https://github.com/anthropics/claude-code",
  },
  {
    name: "BMAD Method",
    category: "Development",
    provides: JSON.stringify(["AI-driven agile workflow", "Story generation", "Architecture templates"]),
    description: "Breakthrough Method of Agile AI-Driven Development framework",
    status: "queue",
    source: "community",
  },
  {
    name: "Roo Code Rules",
    category: "Prompting & Context",
    provides: JSON.stringify(["Curated coding convention rules", "Style enforcement"]),
    description: "Curated rule sets for Claude coding conventions",
    status: "queue",
    source: "community",
  },
  {
    name: "GSD",
    category: "Development",
    provides: JSON.stringify(["Workflow enforcement", "Task completion tracking"]),
    description: "Get Stuff Done workflow enforcement plugin",
    status: "evaluated_rejected",
    source: "community",
    verdictReason: "Overlaps heavily with Superpowers, less maintained",
  },
];

const inserted = db.insert(toolsRegistry).values(seedTools).returning().all();
console.log(`Inserted ${inserted.length} tools`);

// Set up replacement links
const planningId = inserted.find((t) => t.name === "Planning with Files")!.id;
const superpowersId = inserted.find((t) => t.name === "Superpowers")!.id;
const bmadId = inserted.find((t) => t.name === "BMAD Method")!.id;
const gsdId = inserted.find((t) => t.name === "GSD")!.id;

db.update(toolsRegistry)
  .set({ replacesToolId: planningId })
  .where(eq(toolsRegistry.id, bmadId))
  .run();

db.update(toolsRegistry)
  .set({ replacesToolId: superpowersId })
  .where(eq(toolsRegistry.id, gsdId))
  .run();

console.log("Set replacement links: BMAD→Planning with Files, GSD→Superpowers");

const activeTools = inserted.filter((t) => t.status === "active");
const stackEntries = activeTools.map((tool) => ({
  toolId: tool.id,
}));

if (stackEntries.length > 0) {
  db.insert(stackItems).values(stackEntries).run();
  console.log(`Added ${stackEntries.length} items to stack`);
}

// Seed default settings
db.insert(settings)
  .values([
    { key: "provider", value: "openrouter" },
    { key: "api_key", value: "" },
    { key: "model", value: "anthropic/claude-sonnet-4" },
    { key: "search_model", value: "perplexity/sonar" },
  ])
  .run();
console.log("Seeded default settings");

console.log("Seed complete.");
