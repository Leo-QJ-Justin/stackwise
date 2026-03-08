import { generateObject } from "ai";
import { z } from "zod";
import { db } from "./db";
import { toolsRegistry, stackItems, duplicatesLog } from "./db/schema";
import { eq, sql } from "drizzle-orm";
import { getSetting } from "./settings";
import { CATEGORIES, CATEGORY_DEFINITIONS, getProvider } from "./shared";
import { createModel, classifyViaCLI } from "./providers";

export { CATEGORIES };

export { parseProvides } from "./shared";

const metadataSchema = z.object({
  name: z.string().describe("Canonical name of the tool"),
  category: z.enum(CATEGORIES).describe("Best-fit category"),
  description: z
    .string()
    .describe("One-line description of what the tool does"),
  provides: z
    .array(z.string())
    .describe("Concrete capabilities: skills, commands, MCP servers, etc."),
});

export type ToolMetadata = z.infer<typeof metadataSchema>;

const stackVerdictSchema = z.object({
  verdict: z
    .enum(["NEW", "DUPLICATE", "ALTERNATIVE", "UNRELATED"])
    .describe(
      "NEW=fills gap, DUPLICATE=same as existing, ALTERNATIVE=could replace existing, UNRELATED=not relevant"
    ),
  mapsTo: z
    .string()
    .nullable()
    .describe("Name of existing stack tool if DUPLICATE or ALTERNATIVE"),
  confidence: z.number().describe("Confidence score between 0 and 1"),
  reasoning: z
    .string()
    .describe("Plain english explanation of the verdict"),
});

export type StackVerdict = z.infer<typeof stackVerdictSchema>;

/**
 * Parse Claude CLI JSON envelope and validate against a Zod schema.
 * CLI returns `{ result: "..." }` where result contains LLM text with embedded JSON.
 */
function parseCliJson<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Claude CLI returned non-JSON output. Raw output (first 200 chars): ${String(raw).slice(0, 200)}`
    );
  }
  const text = String(parsed.result ?? raw);
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Claude CLI response did not contain JSON. Response (first 200 chars): ${text.slice(0, 200)}`
    );
  }
  let extracted: unknown;
  try {
    extracted = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(
      `Failed to parse JSON from CLI response. Extracted (first 200 chars): ${jsonMatch[0].slice(0, 200)}`
    );
  }
  return schema.parse(extracted);
}

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
      let provStr = "";
      if (t.provides) {
        try { provStr = ` | Provides: ${JSON.parse(t.provides).join(", ")}`; } catch { provStr = ` | Provides: ${t.provides}`; }
      }
      const desc = t.description ? ` — ${t.description}` : "";
      return `- [${t.id}] ${t.name} (${t.category})${desc}${provStr}`;
    })
    .join("\n");
}

/**
 * Step 1 of the two-step pipeline: extract tool metadata (name, category, description, provides).
 * No stack comparison — that is handled separately by compareToStack().
 * Throws on provider misconfiguration or LLM failures.
 */
export async function classifyToolMetadata(input: {
  name: string;
  description?: string;
  readmeContent?: string;
}): Promise<ToolMetadata> {
  const providerId = getSetting("provider") ?? "openrouter";
  const apiKey = getSetting(`api_key:${providerId}`) || getSetting("api_key") || "";
  const providerConfig = getProvider(providerId);

  if (!providerConfig) {
    throw new Error(
      `Unknown provider "${providerId}" in settings. Go to Settings and select a valid provider.`
    );
  }

  if (providerConfig.needsKey && !apiKey) {
    throw new Error(
      `No API key configured for ${providerConfig.label}. Add your key in Settings.`
    );
  }

  const modelId = getSetting("model") || providerConfig.defaultModel;

  const toolContext = input.readmeContent
    ? `Name: ${input.name}\nDescription: ${input.description ?? "N/A"}\n\nREADME content:\n${input.readmeContent}`
    : `Name: ${input.name}\nDescription: ${input.description ?? "N/A"}`;

  const categoryGuide = Object.entries(CATEGORY_DEFINITIONS)
    .map(([cat, def]) => `- ${cat}: ${def}`)
    .join("\n");

  const prompt = `You are a Claude Code tool cataloger. Given a tool's name and README, extract its metadata.

TOOL:
${toolContext}

CATEGORIES (pick the single best fit):
${categoryGuide}

For "provides", list concrete capabilities (e.g. "5 skills for debugging", "MCP server for docs lookup", "slash command /review").

Return: name (canonical), category (one of the categories above), description (one-line), provides (array of capabilities).`;

  try {
    if (providerId === "claude-cli") {
      const raw = await classifyViaCLI(prompt);
      return parseCliJson(raw, metadataSchema);
    }

    const model = await createModel(providerId, apiKey, modelId);
    const { object } = await generateObject({
      model,
      schema: metadataSchema,
      prompt,
    });

    return object;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      throw new Error(`${providerConfig.label} API key is invalid. Check your key in Settings.`);
    }
    if (msg.includes("429")) {
      throw new Error(`${providerConfig.label} rate limit exceeded. Try again later.`);
    }
    if (msg.includes("ECONNREFUSED") && providerId === "ollama") {
      throw new Error(
        "Cannot connect to Ollama at localhost:11434. Make sure Ollama is running (`ollama serve`)."
      );
    }
    console.error(`[classify] metadata LLM call failed (${providerConfig.label}, model: ${modelId}):`, err);
    throw err;
  }
}

/**
 * Step 2 of the two-step pipeline: compare a tool against the current active stack.
 * Requires the tool to already have metadata (from classifyToolMetadata).
 * Reads the active stack from the database via buildStackContext().
 * Returns verdict: NEW, DUPLICATE, ALTERNATIVE, or UNRELATED.
 */
export async function compareToStack(input: {
  name: string;
  category: string;
  description: string;
  provides: string[];
}): Promise<StackVerdict> {
  const providerId = getSetting("provider") ?? "openrouter";
  const apiKey = getSetting(`api_key:${providerId}`) || getSetting("api_key") || "";
  const providerConfig = getProvider(providerId);

  if (!providerConfig) {
    throw new Error(
      `Unknown provider "${providerId}" in settings. Go to Settings and select a valid provider.`
    );
  }

  if (providerConfig.needsKey && !apiKey) {
    throw new Error(
      `No API key configured for ${providerConfig.label}. Add your key in Settings.`
    );
  }

  const modelId = getSetting("model") || providerConfig.defaultModel;
  const stackContext = buildStackContext();

  const toolContext = `Name: ${input.name}\nCategory: ${input.category}\nDescription: ${input.description}\nCapabilities: ${input.provides.join(", ")}`;

  const prompt = `You are a Claude Code stack analyst. Compare a tool against the user's active stack.

ACTIVE STACK:
${stackContext}

TOOL TO EVALUATE:
${toolContext}

Classification rules:
- NEW: This tool fills a gap — nothing in the active stack covers what it does.
- DUPLICATE: This tool does essentially the same thing as an existing stack tool. Set mapsTo to the existing tool's name.
- ALTERNATIVE: This tool could replace an existing stack tool (does similar job, possibly better). Set mapsTo to the existing tool's name.
- UNRELATED: This tool is not relevant to Claude Code development workflows.

Return: verdict (NEW|DUPLICATE|ALTERNATIVE|UNRELATED), mapsTo (string or null), confidence (0-1), reasoning.`;

  try {
    if (providerId === "claude-cli") {
      const raw = await classifyViaCLI(prompt);
      return parseCliJson(raw, stackVerdictSchema);
    }

    const model = await createModel(providerId, apiKey, modelId);
    const { object } = await generateObject({
      model,
      schema: stackVerdictSchema,
      prompt,
    });

    return object;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("Unauthorized")) {
      throw new Error(`${providerConfig.label} API key is invalid. Check your key in Settings.`);
    }
    if (msg.includes("429")) {
      throw new Error(`${providerConfig.label} rate limit exceeded. Try again later.`);
    }
    if (msg.includes("ECONNREFUSED") && providerId === "ollama") {
      throw new Error(
        "Cannot connect to Ollama at localhost:11434. Make sure Ollama is running (`ollama serve`)."
      );
    }
    console.error(`[classify] stack comparison failed (${providerConfig.label}, model: ${modelId}):`, err);
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
  verdict: StackVerdict | null;
}> {
  // Registry dedup check (normalized: ignore case and hyphens/spaces)
  const existing = db
    .select()
    .from(toolsRegistry)
    .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${input.name}, '-', ' '))`)
    .get();

  if (existing) {
    return { tool: existing, verdict: null };
  }

  // Step 1: Discovery — what is this tool?
  const meta = await classifyToolMetadata(input);

  // Step 2: Stack comparison — how does it fit?
  let verdict: StackVerdict | null = null;
  try {
    verdict = await compareToStack({
      name: input.name,
      category: meta.category,
      description: meta.description,
      provides: meta.provides,
    });
  } catch (err) {
    // Infrastructure errors (DB, provider config) should propagate — not be masked.
    // Only LLM/parsing failures are non-fatal.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("SQLITE") || msg.includes("Unknown provider") || msg.includes("No API key configured")) {
      throw err;
    }
    console.warn(`[classify] stack comparison failed for "${input.name}", proceeding with discovery only:`, err);
  }

  // Step 3: Determine status based on forceActive + verdict
  let status: string;
  let replacesToolId: number | null = null;

  if (input.forceActive) {
    // Installed plugins: always active, but log overlaps
    status = "active";
  } else if (verdict) {
    switch (verdict.verdict) {
      case "NEW":
        status = "queue";
        break;
      case "ALTERNATIVE":
        status = "queue";
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
      default:
        status = "unclassified";
    }
  } else {
    status = "unclassified";
  }

  // Step 4: Insert tool with metadata + verdict
  const [tool] = db
    .insert(toolsRegistry)
    .values({
      name: input.name,
      category: meta.category,
      description: meta.description,
      provides: JSON.stringify(meta.provides),
      status,
      source: input.forceActive ? "installed" : "community",
      verdictReason: verdict?.reasoning ?? null,
      replacesToolId,
    })
    .returning()
    .all();

  // Add to stack if active
  if (status === "active") {
    db.insert(stackItems).values({ toolId: tool.id }).run();
  }

  // Log duplicates/rejections (community tools only — installed tools get overlap log below)
  if (!input.forceActive && verdict && (verdict.verdict === "DUPLICATE" || verdict.verdict === "UNRELATED")) {
    db.insert(duplicatesLog)
      .values({
        verdict: verdict.verdict,
        mappedToName: verdict.mapsTo,
        reason: verdict.reasoning,
      })
      .run();
  }

  // For installed tools that overlap, log for awareness but don't change status
  if (
    input.forceActive &&
    verdict &&
    (verdict.verdict === "DUPLICATE" || verdict.verdict === "ALTERNATIVE")
  ) {
    db.insert(duplicatesLog)
      .values({
        verdict: `OVERLAP_${verdict.verdict}`,
        mappedToName: verdict.mapsTo,
        reason: `Installed tool "${input.name}" overlaps with "${verdict.mapsTo}": ${verdict.reasoning}`,
      })
      .run();
  }

  return { tool, verdict };
}
