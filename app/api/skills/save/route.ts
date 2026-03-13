import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, skillCompositions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { validateComposition, computeTier, cascadeTiers } from "@/lib/composition";
import { isValidMergeType, isIntegerArray } from "@/lib/types";
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
      mergeType: string;
      intent: string;
      skillPath: string;
    };

    if (!name || !content || !baseSkillIds?.length || !mergeType || !skillPath) {
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

    // Resolve ~ to home directory and canonicalize for path safety
    const home = os.homedir();
    const fsPath = path.resolve(skillPath.replace(/^~/, home));
    if (!fsPath.startsWith(home + path.sep) && fsPath !== home) {
      return NextResponse.json({ error: "Skill path must be under your home directory" }, { status: 400 });
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
      try {
        if (id && oldContent !== null) {
          fs.writeFileSync(fsPath, oldContent, "utf-8");
        } else if (!id && fs.existsSync(fsPath)) {
          fs.unlinkSync(fsPath);
        }
      } catch (rollbackErr) {
        console.error("[skills/save] Filesystem rollback also failed:", rollbackErr);
        console.error("[skills/save] Original DB error was:", dbError);
      }
      throw dbError;
    }
  } catch (error) {
    console.error("[skills/save] Failed:", error);
    const message = error instanceof Error ? error.message : "Failed to save composition";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
