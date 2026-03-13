import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/settings";
import { getProvider } from "@/lib/shared";
import { createModel, classifyViaCLI } from "@/lib/providers";
import { generateText } from "ai";
import { isIntegerArray } from "@/lib/types";
import fs from "fs";

// POST /api/skills/[id]/regenerate — re-generate composite content
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid skill ID" }, { status: 400 });
    }

    const skill = db.select().from(toolsRegistry).where(eq(toolsRegistry.id, id)).get();

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await request.json();
    const { baseSkillIds, intent } = body as {
      baseSkillIds: number[];
      intent: string;
    };

    if (!baseSkillIds?.length || !intent) {
      return NextResponse.json({ error: "Missing required fields: baseSkillIds, intent" }, { status: 400 });
    }

    if (!isIntegerArray(baseSkillIds)) {
      return NextResponse.json({ error: "baseSkillIds must be an array of integers" }, { status: 400 });
    }

    // Read base skill contents
    const baseSkills: { name: string; content: string }[] = [];
    for (const baseId of baseSkillIds) {
      const base = db.select().from(toolsRegistry).where(eq(toolsRegistry.id, baseId)).get();
      if (!base) {
        return NextResponse.json({ error: `Base skill #${baseId} not found — it may have been deleted` }, { status: 404 });
      }

      let content = "";
      if (base.skillPath && fs.existsSync(base.skillPath)) {
        content = fs.readFileSync(base.skillPath, "utf-8");
      } else {
        content = `# ${base.name}\n\n${base.description ?? "No description."}`;
      }
      baseSkills.push({ name: base.name, content });
    }

    const mergeType = skill.mergeType ?? "orchestrator";
    const baseSkillsBlock = baseSkills
      .map((s, i) => `### Base Skill ${i + 1}: ${s.name}\n\`\`\`\n${s.content}\n\`\`\``)
      .join("\n\n");

    const mergeInstruction = mergeType === "orchestrator"
      ? "Create an ORCHESTRATOR skill that references each base skill by name and coordinates them."
      : "Create a MUTATION skill that fuses all base skills into a single standalone skill.";

    const systemPrompt = `You are a Claude Code skill composer. ${mergeInstruction}\n\nOutput ONLY the complete markdown content including YAML frontmatter.`;
    const userPrompt = `## Intent\n${intent}\n\n## Base Skills\n${baseSkillsBlock}\n\nRegenerate the composite skill "${skill.name}".`;

    const providerId = getSetting("provider") ?? "openrouter";
    const apiKey = getSetting(`api_key:${providerId}`) || getSetting("api_key") || "";
    const providerConfig = getProvider(providerId);

    if (!providerConfig || (providerConfig.needsKey && !apiKey)) {
      return NextResponse.json({ error: "LLM provider not configured" }, { status: 500 });
    }

    const modelId = getSetting("model") || providerConfig.defaultModel;
    let generatedContent: string;

    if (providerId === "claude-cli") {
      generatedContent = await classifyViaCLI(`${systemPrompt}\n\n${userPrompt}`);
      try {
        const parsed = JSON.parse(generatedContent);
        generatedContent = String(parsed.result ?? generatedContent);
      } catch (parseErr) {
        console.warn("[skills/regenerate] CLI output is not JSON, using raw output:",
          (parseErr as Error).message);
      }
    } else {
      const model = await createModel(providerId, apiKey, modelId);
      const { text } = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      generatedContent = text;
    }

    return NextResponse.json({ generatedContent });
  } catch (error) {
    console.error("[skills/regenerate] Failed:", error);
    return NextResponse.json({ error: "Regeneration failed" }, { status: 500 });
  }
}
