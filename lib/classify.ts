import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { db } from "./db";
import { toolsRegistry, stackItems, duplicatesLog } from "./db/schema";
import { eq } from "drizzle-orm";
import { getSetting } from "./settings";
import { CATEGORIES } from "./shared";

export { CATEGORIES };

export const verdictSchema = z.object({
  name: z.string().describe("Canonical name of the tool"),
  category: z.enum(CATEGORIES).describe("Best-fit category"),
  description: z
    .string()
    .describe("One-line description of what the tool does"),
  provides: z
    .array(z.string())
    .describe("Concrete capabilities: skills, commands, MCP servers, etc."),
  verdict: z
    .enum(["NEW", "DUPLICATE", "ALTERNATIVE", "UNRELATED"])
    .describe(
      "NEW=fills gap, DUPLICATE=same as existing, ALTERNATIVE=could replace existing, UNRELATED=not relevant"
    ),
  mapsTo: z
    .string()
    .nullable()
    .describe("Name of existing stack tool if DUPLICATE or ALTERNATIVE"),
  confidence: z.number().min(0).max(1),
  reasoning: z
    .string()
    .describe("Plain english explanation of the verdict"),
});

export type Verdict = z.infer<typeof verdictSchema>;

export { parseProvides } from "./shared";

function buildStackContext(): string {
  const items = db
    .select({
      id: toolsRegistry.id,
      name: toolsRegistry.name,
      category: toolsRegistry.category,
      description: toolsRegistry.description,
      provides: toolsRegistry.provides,
    })
    .from(stackItems)
    .innerJoin(toolsRegistry, eq(stackItems.toolId, toolsRegistry.id))
    .all();

  if (items.length === 0) return "The user has no tools in their active stack.";

  return items
    .map((t) => {
      const prov = t.provides ? ` | Provides: ${t.provides}` : "";
      const desc = t.description ? ` — ${t.description}` : "";
      return `- [${t.id}] ${t.name} (${t.category})${desc}${prov}`;
    })
    .join("\n");
}

export async function classifyTool(input: {
  name: string;
  description?: string;
  readmeContent?: string;
}): Promise<Verdict | null> {
  const apiKey = getSetting("openrouter_api_key");
  if (!apiKey) {
    console.warn("[classify] No OpenRouter API key configured, skipping");
    return null;
  }

  const modelId = getSetting("default_model") ?? "anthropic/claude-sonnet-4";
  const openrouter = createOpenRouter({ apiKey });
  const stackContext = buildStackContext();

  const toolContext = input.readmeContent
    ? `Name: ${input.name}\nDescription: ${input.description ?? "N/A"}\n\nREADME content:\n${input.readmeContent}`
    : `Name: ${input.name}\nDescription: ${input.description ?? "N/A"}`;

  try {
    const { object: verdict } = await generateObject({
      model: openrouter(modelId),
      schema: verdictSchema,
      prompt: `You are a Claude Code stack analyst. You evaluate tools for a developer's productivity stack.

Given the user's ACTIVE STACK and a NEW TOOL, classify the new tool.

ACTIVE STACK:
${stackContext}

NEW TOOL:
${toolContext}

Classification rules:
- NEW: This tool fills a gap — nothing in the active stack covers what it does.
- DUPLICATE: This tool does essentially the same thing as an existing stack tool. Set mapsTo to the existing tool's name.
- ALTERNATIVE: This tool could replace an existing stack tool (does similar job, possibly better). Set mapsTo to the existing tool's name.
- UNRELATED: This tool is not relevant to Claude Code development workflows.

For "provides", list concrete capabilities (e.g. "5 skills for debugging", "MCP server for docs lookup", "slash command /review").

Return your classification.`,
    });

    return verdict;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      throw new Error("OpenRouter API key is invalid. Check your key in Settings.");
    }
    if (msg.includes("429")) {
      throw new Error("OpenRouter rate limit exceeded. Try again later.");
    }
    console.error(`[classify] LLM call failed (model: ${modelId}):`, err);
    throw err;
  }
}

export async function classifyAndStore(input: {
  name: string;
  description?: string;
  readmeContent?: string;
  forceActive?: boolean;
}): Promise<{
  tool: typeof toolsRegistry.$inferSelect;
  verdict: Verdict | null;
}> {
  // Registry dedup check
  const existing = db
    .select()
    .from(toolsRegistry)
    .where(eq(toolsRegistry.name, input.name))
    .get();

  if (existing) {
    return { tool: existing, verdict: null };
  }

  // Classify
  const verdict = await classifyTool(input);

  // Determine status and replacesToolId
  let status = "unclassified";
  let replacesToolId: number | null = null;

  if (input.forceActive) {
    status = "active";
  } else if (verdict) {
    switch (verdict.verdict) {
      case "NEW":
        status = "queue";
        break;
      case "ALTERNATIVE":
        status = "queue";
        // Look up the tool ID from mapsTo name
        if (verdict.mapsTo) {
          const mapped = db
            .select()
            .from(toolsRegistry)
            .where(eq(toolsRegistry.name, verdict.mapsTo))
            .get();
          if (mapped) replacesToolId = mapped.id;
        }
        break;
      case "DUPLICATE":
      case "UNRELATED":
        status = "evaluated_rejected";
        break;
    }
  }

  // Insert tool
  const [tool] = db
    .insert(toolsRegistry)
    .values({
      name: verdict?.name ?? input.name,
      category: verdict?.category ?? "Development",
      description: verdict?.description ?? input.description ?? null,
      provides: verdict?.provides ? JSON.stringify(verdict.provides) : null,
      status,
      source: "community",
      verdictReason: verdict?.reasoning ?? null,
      replacesToolId,
    })
    .returning()
    .all();

  // If forced active (installed tool), add to stack
  if (input.forceActive) {
    db.insert(stackItems).values({ toolId: tool.id }).run();
  }

  // Log duplicates/unrelated to duplicates_log
  if (
    verdict &&
    (verdict.verdict === "DUPLICATE" || verdict.verdict === "UNRELATED")
  ) {
    db.insert(duplicatesLog)
      .values({
        verdict: verdict.verdict,
        mappedToName: verdict.mapsTo,
        reason: verdict.reasoning,
      })
      .run();
  }

  // Log overlap warning for installed tools
  if (
    input.forceActive &&
    verdict &&
    (verdict.verdict === "DUPLICATE" || verdict.verdict === "ALTERNATIVE")
  ) {
    db.insert(duplicatesLog)
      .values({
        verdict: `OVERLAP_${verdict.verdict}`,
        mappedToName: verdict.mapsTo,
        reason: `Installed tool "${verdict.name}" overlaps with "${verdict.mapsTo}": ${verdict.reasoning}`,
      })
      .run();
  }

  return { tool, verdict };
}
