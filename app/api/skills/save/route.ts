import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, skillCompositions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateComposition, computeTier, cascadeTiers } from "@/lib/composition";
import { isValidMergeType, isIntegerArray } from "@/lib/types";

// POST /api/skills/save — record composed skill in DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, content, baseSkillIds, mergeType, intent } = body as {
      id: number | null;
      name: string;
      content: string;
      baseSkillIds: number[];
      mergeType: string;
      intent: string;
    };

    if (!name || !content || !baseSkillIds?.length || !mergeType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isValidMergeType(mergeType)) {
      return NextResponse.json({ error: "mergeType must be 'orchestrator' or 'mutation'" }, { status: 400 });
    }

    if (!isIntegerArray(baseSkillIds)) {
      return NextResponse.json({ error: "baseSkillIds must be an array of integers" }, { status: 400 });
    }

    if (new Set(baseSkillIds).size !== baseSkillIds.length) {
      return NextResponse.json({ error: "Duplicate base skills are not allowed" }, { status: 400 });
    }

    // Validate composition (cycles, tier depth, minimum bases)
    const validationError = validateComposition(id, baseSkillIds);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const tier = computeTier(baseSkillIds);

    // Verify skill exists when updating
    if (id) {
      const existing = db.select({ id: toolsRegistry.id }).from(toolsRegistry).where(eq(toolsRegistry.id, id)).get();
      if (!existing) {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 });
      }
    }

    // DB operations in a transaction
    const result = db.transaction((tx) => {
      let skillId: number;

      if (id) {
        // Update existing composite
        tx.update(toolsRegistry)
          .set({
            name,
            mergeType,
            tier,
            generationPrompt: intent,
            lastUpdated: sql`(CURRENT_TIMESTAMP)`,
          })
          .where(eq(toolsRegistry.id, id))
          .run();

        // Delete old composition edges
        tx.delete(skillCompositions)
          .where(eq(skillCompositions.compositeSkillId, id))
          .run();

        skillId = id;
      } else {
        // Insert new composite
        const description = content.match(/description:\s*(.+)/)?.[1]?.trim() ?? null;
        const [inserted] = tx
          .insert(toolsRegistry)
          .values({
            name,
            category: "Workflow & Agents",
            capabilityType: "skill",
            mergeType,
            tier,
            generationPrompt: intent,
            source: "self_created",
            status: "active",
            description,
          })
          .returning()
          .all();

        skillId = inserted.id;
      }

      // Insert new composition edges
      for (let i = 0; i < baseSkillIds.length; i++) {
        tx.insert(skillCompositions)
          .values({
            compositeSkillId: skillId,
            baseSkillId: baseSkillIds[i],
            position: i + 1,
          })
          .run();
      }

      return skillId;
    });

    // Cascade tier recalculation (outside transaction — reads current state)
    cascadeTiers(result);

    // Build response
    const saved = db.select().from(toolsRegistry).where(eq(toolsRegistry.id, result)).get();
    const baseSkills = db
      .select({
        id: skillCompositions.baseSkillId,
        name: toolsRegistry.name,
        position: skillCompositions.position,
      })
      .from(skillCompositions)
      .innerJoin(toolsRegistry, eq(skillCompositions.baseSkillId, toolsRegistry.id))
      .where(eq(skillCompositions.compositeSkillId, result))
      .orderBy(skillCompositions.position)
      .all();

    return NextResponse.json({ ...saved, baseSkills });
  } catch (error) {
    console.error("[skills/save] Failed:", error);
    const message = error instanceof Error ? error.message : "Failed to save composition";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
