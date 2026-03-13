import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, skillCompositions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/skills — list all skills with composition data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");

    let skills;
    if (source) {
      skills = db
        .select()
        .from(toolsRegistry)
        .where(eq(toolsRegistry.source, source))
        .all();
    } else {
      skills = db.select().from(toolsRegistry).all();
    }

    const enriched = skills.map((skill) => {
      const baseSkills = db
        .select({
          id: skillCompositions.baseSkillId,
          name: toolsRegistry.name,
          position: skillCompositions.position,
        })
        .from(skillCompositions)
        .innerJoin(toolsRegistry, eq(skillCompositions.baseSkillId, toolsRegistry.id))
        .where(eq(skillCompositions.compositeSkillId, skill.id))
        .orderBy(skillCompositions.position)
        .all();

      const usedByRow = db
        .select({ count: sql<number>`count(*)` })
        .from(skillCompositions)
        .where(eq(skillCompositions.baseSkillId, skill.id))
        .get();

      return {
        ...skill,
        baseSkills,
        usedByCount: usedByRow?.count ?? 0,
      };
    });

    return NextResponse.json({ skills: enriched });
  } catch (error) {
    console.error("[skills] Failed to fetch skills:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
