import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, skillCompositions } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

// GET /api/skills — list active skills grouped by parent plugin
export async function GET() {
  try {
    // 1. Fetch only active skills
    const skills = db
      .select()
      .from(toolsRegistry)
      .where(
        and(
          eq(toolsRegistry.capabilityType, "skill"),
          eq(toolsRegistry.status, "active"),
        )
      )
      .all();

    // 2. Batch-load composition edges and usedBy counts
    const allEdges = db
      .select({
        compositeSkillId: skillCompositions.compositeSkillId,
        baseSkillId: skillCompositions.baseSkillId,
        baseName: toolsRegistry.name,
        position: skillCompositions.position,
      })
      .from(skillCompositions)
      .innerJoin(toolsRegistry, eq(skillCompositions.baseSkillId, toolsRegistry.id))
      .orderBy(skillCompositions.position)
      .all();

    const edgesByComposite = new Map<number, { id: number; name: string; position: number }[]>();
    const usedByCounts = new Map<number, number>();

    for (const edge of allEdges) {
      if (!edgesByComposite.has(edge.compositeSkillId)) {
        edgesByComposite.set(edge.compositeSkillId, []);
      }
      edgesByComposite.get(edge.compositeSkillId)!.push({
        id: edge.baseSkillId,
        name: edge.baseName,
        position: edge.position,
      });
      usedByCounts.set(edge.baseSkillId, (usedByCounts.get(edge.baseSkillId) ?? 0) + 1);
    }

    // 3. Enrich skills with composition data
    const enriched = skills.map((skill) => ({
      ...skill,
      baseSkills: edgesByComposite.get(skill.id) ?? [],
      usedByCount: usedByCounts.get(skill.id) ?? 0,
    }));

    // 4. Collect distinct parentPluginIds and batch-fetch plugin names
    const parentIds = [...new Set(
      enriched.filter((s) => s.parentPluginId != null).map((s) => s.parentPluginId!)
    )];

    const pluginMap = new Map<number, { id: number; name: string }>();
    if (parentIds.length > 0) {
      const parents = db
        .select({ id: toolsRegistry.id, name: toolsRegistry.name })
        .from(toolsRegistry)
        .where(inArray(toolsRegistry.id, parentIds))
        .all();
      for (const p of parents) {
        pluginMap.set(p.id, p);
      }
    }

    // 5. Group into plugins[] and standalone[]
    const pluginGroups = new Map<number, typeof enriched>();
    const standalone: typeof enriched = [];

    for (const skill of enriched) {
      if (skill.parentPluginId != null && pluginMap.has(skill.parentPluginId)) {
        if (!pluginGroups.has(skill.parentPluginId)) {
          pluginGroups.set(skill.parentPluginId, []);
        }
        pluginGroups.get(skill.parentPluginId)!.push(skill);
      } else {
        standalone.push(skill);
      }
    }

    const plugins = [...pluginGroups.entries()].map(([parentId, groupSkills]) => ({
      id: parentId,
      name: pluginMap.get(parentId)!.name,
      skills: groupSkills,
    }));

    // Sort plugins alphabetically, standalone by name
    plugins.sort((a, b) => a.name.localeCompare(b.name));
    standalone.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ plugins, standalone });
  } catch (error) {
    console.error("[skills] Failed to fetch skills:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
