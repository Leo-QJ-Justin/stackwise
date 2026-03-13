import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, skillCompositions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateComposition, computeTier, cascadeTiers } from "@/lib/composition";
import fs from "fs";
import path from "path";
import os from "os";

// POST /api/skills/save — save composed skill to filesystem + DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, content, baseSkillIds, mergeType, intent, skillPath } = body as {
      id: number | null;
      name: string;
      content: string;
      baseSkillIds: number[];
      mergeType: "orchestrator" | "mutation";
      intent: string;
      skillPath: string;
    };

    if (!name || !content || !baseSkillIds?.length || !mergeType || !skillPath) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Resolve ~ to home directory for filesystem operations
    const fsPath = skillPath.replace(/^~/, os.homedir());

    // Path safety: must be under home directory
    const home = os.homedir();
    if (!fsPath.startsWith(home)) {
      return NextResponse.json({ error: "Skill path must be under your home directory" }, { status: 400 });
    }

    // Validate
    const validationError = validateComposition(id, baseSkillIds);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const tier = computeTier(baseSkillIds);

    // Read old content for rollback (extend case)
    let oldContent: string | null = null;
    if (id && fs.existsSync(fsPath)) {
      oldContent = fs.readFileSync(fsPath, "utf-8");
    }

    // Write .md file first
    const dir = path.dirname(fsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fsPath, content, "utf-8");

    try {
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
              skillPath: fsPath,
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
              skillPath: fsPath,
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
    } catch (dbError) {
      // Rollback filesystem on DB failure
      if (id && oldContent !== null) {
        fs.writeFileSync(fsPath, oldContent, "utf-8");
      } else if (!id && fs.existsSync(fsPath)) {
        fs.unlinkSync(fsPath);
      }
      throw dbError;
    }
  } catch (error) {
    console.error("[skills/save] Failed:", error);
    const message = error instanceof Error ? error.message : "Failed to save composition";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
