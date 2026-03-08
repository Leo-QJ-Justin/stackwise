import { generateObject } from "ai";
import { z } from "zod";
import { db } from "./db";
import { toolsRegistry, stackItems, duplicatesLog } from "./db/schema";
import { eq, sql } from "drizzle-orm";
import { getSetting } from "./settings";
import { CATEGORIES, getProvider } from "./shared";
import { createModel, classifyViaCLI } from "./providers";

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
  confidence: z.number().describe("Confidence score between 0 and 1"),
  reasoning: z
    .string()
    .describe("Plain english explanation of the verdict"),
});

export type Verdict = z.infer<typeof verdictSchema>;

export { parseProvides } from "./shared";

const metadataSchema = verdictSchema.pick({
  name: true,
  category: true,
  description: true,
  provides: true,
});

export type ToolMetadata = z.infer<typeof metadataSchema>;

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

function buildPrompt(stackContext: string, toolContext: string): string {
  return `You are a Claude Code stack analyst. You evaluate tools for a developer's productivity stack.

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

Return your classification as JSON with these fields: name, category (one of: ${CATEGORIES.join(", ")}), description, provides (array), verdict (NEW|DUPLICATE|ALTERNATIVE|UNRELATED), mapsTo (string or null), confidence (0-1), reasoning.`;
}

/**
 * Parse the Claude CLI response into a Verdict.
 * The CLI returns a JSON envelope with a `result` field containing the LLM text.
 */
function parseCliResponse(raw: string): Verdict {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Claude CLI returned non-JSON output. The CLI may not be authenticated. ` +
      `Raw output (first 200 chars): ${raw.slice(0, 200)}`
    );
  }

  const text = String(parsed.result ?? raw);
  const jsonMatch = text.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error(
      `Claude CLI response did not contain a JSON classification. ` +
      `Response (first 200 chars): ${text.slice(0, 200)}`
    );
  }

  let verdictRaw: unknown;
  try {
    verdictRaw = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(
      `Failed to parse classification JSON from CLI response. ` +
      `Extracted (first 200 chars): ${jsonMatch[0].slice(0, 200)}`
    );
  }

  return verdictSchema.parse(verdictRaw);
}

export async function classifyTool(input: {
  name: string;
  description?: string;
  readmeContent?: string;
}): Promise<Verdict | null> {
  const providerId = getSetting("provider") ?? "openrouter";
  const apiKey = getSetting(`api_key:${providerId}`) || getSetting("api_key") || "";
  const providerConfig = getProvider(providerId);

  if (!providerConfig) {
    throw new Error(
      `Unknown provider "${providerId}" in settings. Go to Settings and select a valid provider.`
    );
  }

  // Check if API key is needed but missing
  if (providerConfig.needsKey && !apiKey) {
    throw new Error(
      `No API key configured for ${providerConfig.label}. Add your key in Settings.`
    );
  }

  const modelId = getSetting("model") || providerConfig.defaultModel;
  const stackContext = buildStackContext();

  const toolContext = input.readmeContent
    ? `Name: ${input.name}\nDescription: ${input.description ?? "N/A"}\n\nREADME content:\n${input.readmeContent}`
    : `Name: ${input.name}\nDescription: ${input.description ?? "N/A"}`;

  const prompt = buildPrompt(stackContext, toolContext);

  try {
    // Claude Code CLI path
    if (providerId === "claude-cli") {
      const raw = await classifyViaCLI(prompt);
      return parseCliResponse(raw);
    }

    // AI SDK path (all other providers)
    const model = await createModel(providerId, apiKey, modelId);
    const { object: verdict } = await generateObject({
      model,
      schema: verdictSchema,
      prompt,
    });

    return verdict;
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
    console.error(`[classify] LLM call failed (${providerConfig.label}, model: ${modelId}):`, err);
    throw err;
  }
}

/**
 * Classify a tool for metadata only (name, category, description, provides).
 * No stack comparison — used for installed plugins where verdict is irrelevant.
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

  const prompt = `You are a Claude Code tool cataloger. Given a tool's name and README, extract its metadata.

TOOL:
${toolContext}

For "provides", list concrete capabilities (e.g. "5 skills for debugging", "MCP server for docs lookup", "slash command /review").

Return: name (canonical), category (one of: ${CATEGORIES.join(", ")}), description (one-line), provides (array of capabilities).`;

  try {
    if (providerId === "claude-cli") {
      const raw = await classifyViaCLI(prompt);
      const parsed = parseCliResponse(raw);
      return { name: parsed.name, category: parsed.category, description: parsed.description, provides: parsed.provides };
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

export async function classifyAndStore(input: {
  name: string;
  description?: string;
  readmeContent?: string;
  forceActive?: boolean;
}): Promise<{
  tool: typeof toolsRegistry.$inferSelect;
  verdict: Verdict | null;
}> {
  // Registry dedup check (fuzzy: ignore case and hyphens/spaces)
  const existing = db
    .select()
    .from(toolsRegistry)
    .where(sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${input.name}, '-', ' '))`)
    .get();

  if (existing) {
    return { tool: existing, verdict: null };
  }

  // For installed plugins (forceActive), use metadata-only classification
  // No stack comparison — avoids nonsensical verdicts
  if (input.forceActive) {
    const meta = await classifyToolMetadata(input);

    const [tool] = db
      .insert(toolsRegistry)
      .values({
        name: input.name,
        category: meta.category,
        description: meta.description,
        provides: JSON.stringify(meta.provides),
        status: "active",
        source: "installed",
        verdictReason: null,
      })
      .returning()
      .all();

    db.insert(stackItems).values({ toolId: tool.id }).run();
    return { tool, verdict: null };
  }

  // For non-installed tools (community), do full stack comparison with verdict
  const verdict = await classifyTool(input);

  let status = "unclassified";
  let replacesToolId: number | null = null;

  if (verdict) {
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
    }
  }

  const [tool] = db
    .insert(toolsRegistry)
    .values({
      name: input.name,
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

  return { tool, verdict };
}
