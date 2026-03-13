import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, skillCompositions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/skills/[id]/graph — focus graph data
export async function GET(
  _request: NextRequest,
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

    // Base skills this composite depends on
    const dependsOn = db
      .select({
        id: toolsRegistry.id,
        name: toolsRegistry.name,
        tier: toolsRegistry.tier,
        mergeType: toolsRegistry.mergeType,
        position: skillCompositions.position,
        status: toolsRegistry.status,
      })
      .from(skillCompositions)
      .innerJoin(toolsRegistry, eq(skillCompositions.baseSkillId, toolsRegistry.id))
      .where(eq(skillCompositions.compositeSkillId, id))
      .orderBy(skillCompositions.position)
      .all();

    // Downstream composites that reference this skill
    const usedBy = db
      .select({
        id: toolsRegistry.id,
        name: toolsRegistry.name,
        tier: toolsRegistry.tier,
        mergeType: toolsRegistry.mergeType,
      })
      .from(skillCompositions)
      .innerJoin(toolsRegistry, eq(skillCompositions.compositeSkillId, toolsRegistry.id))
      .where(eq(skillCompositions.baseSkillId, id))
      .all();

    return NextResponse.json({
      skill: {
        id: skill.id,
        name: skill.name,
        tier: skill.tier,
        mergeType: skill.mergeType,
        description: skill.description,
        skillPath: skill.skillPath,
        generationPrompt: skill.generationPrompt,
        capabilityType: skill.capabilityType,
        source: skill.source,
        status: skill.status,
      },
      dependsOn,
      usedBy,
    });
  } catch (error) {
    console.error("[skills/graph] Failed:", error);
    return NextResponse.json({ error: "Failed to load graph" }, { status: 500 });
  }
}
