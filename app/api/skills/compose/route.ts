import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/settings";
import { getProvider } from "@/lib/shared";
import { createModel, classifyViaCLI } from "@/lib/providers";
import fs from "fs";

// POST /api/skills/compose — generate composite skill content via LLM (preview only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, baseSkillIds, mergeType, intent } = body as {
      name: string;
      baseSkillIds: number[];
      mergeType: "orchestrator" | "mutation";
      intent: string;
    };

    if (!name || !baseSkillIds?.length || !mergeType || !intent) {
      return NextResponse.json(
        { error: "Missing required fields: name, baseSkillIds, mergeType, intent" },
        { status: 400 }
      );
    }

    // Read base skill contents
    const baseSkills: { name: string; content: string }[] = [];
    for (const id of baseSkillIds) {
      const skill = db.select().from(toolsRegistry).where(eq(toolsRegistry.id, id)).get();
      if (!skill) {
        return NextResponse.json({ error: `Base skill #${id} not found` }, { status: 404 });
      }

      let content = "";
      if (skill.skillPath && fs.existsSync(skill.skillPath)) {
        content = fs.readFileSync(skill.skillPath, "utf-8");
      } else {
        content = `# ${skill.name}\n\n${skill.description ?? "No description available."}`;
      }
      baseSkills.push({ name: skill.name, content });
    }

    const baseSkillsBlock = baseSkills
      .map((s, i) => `### Base Skill ${i + 1}: ${s.name}\n\`\`\`\n${s.content}\n\`\`\``)
      .join("\n\n");

    const mergeInstruction = mergeType === "orchestrator"
      ? "Create an ORCHESTRATOR skill that references each base skill by name and coordinates them in sequence. The composite should define the workflow — when to invoke each base skill, what data flows between them, and how results combine. Base skills retain their identity; the composite coordinates them."
      : "Create a MUTATION skill that synthesizes the knowledge and capabilities of all base skills into a single, standalone skill. The result should not depend on the original skills at runtime — it should be a fused, self-contained skill that combines the best of each input.";

    const systemPrompt = `You are a Claude Code skill composer. You create composite skills by combining base skills.

${mergeInstruction}

Output ONLY the complete markdown content for the new skill file, including YAML frontmatter with name and description fields.

The frontmatter should follow this format:
---
name: ${name}
description: <one-line description of what this composite does>
---

After the frontmatter, write the full skill content.`;

    const userPrompt = `## Intent
${intent}

## Base Skills to Compose
${baseSkillsBlock}

Create the composite skill "${name}" as described above.`;

    // Call LLM
    const providerId = getSetting("provider") ?? "openrouter";
    const apiKey = getSetting(`api_key:${providerId}`) || getSetting("api_key") || "";
    const providerConfig = getProvider(providerId);

    if (!providerConfig) {
      return NextResponse.json({ error: `Unknown provider: ${providerId}` }, { status: 500 });
    }
    if (providerConfig.needsKey && !apiKey) {
      return NextResponse.json({ error: `No API key for ${providerConfig.label}` }, { status: 500 });
    }

    const modelId = getSetting("model") || providerConfig.defaultModel;
    let generatedContent: string;

    if (providerId === "claude-cli") {
      generatedContent = await classifyViaCLI(`${systemPrompt}\n\n${userPrompt}`);
      try {
        const parsed = JSON.parse(generatedContent);
        generatedContent = String(parsed.result ?? generatedContent);
      } catch {
        // Use raw output
      }
    } else {
      const model = await createModel(providerId, apiKey, modelId);
      const { text } = await generateText({ model, system: systemPrompt, prompt: userPrompt });
      generatedContent = text;
    }

    const suggestedFilename = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".md";

    return NextResponse.json({ generatedContent, suggestedFilename });
  } catch (error) {
    console.error("[skills/compose] Generation failed:", error);
    return NextResponse.json(
      { error: "LLM generation failed", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
