import { eq } from "drizzle-orm";
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
    // replacesToolId set after insert (references Planning with Files)
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
    // replacesToolId set after insert (was suggested to replace Superpowers)
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

console.log("Seed complete.");
