import { db } from "./db";
import { toolsRegistry, skillCompositions } from "./db/schema";
import { eq } from "drizzle-orm";

const MAX_TIER = 10;

function getSkillName(id: number): string {
  const s = db.select({ name: toolsRegistry.name }).from(toolsRegistry).where(eq(toolsRegistry.id, id)).get();
  return s?.name ?? `#${id}`;
}

/**
 * Detect circular dependencies. Returns the cycle path if found, null if safe.
 *
 * For each proposed base skill, walks DOWNWARD through its own dependencies
 * to check if the compositeId appears as a transitive dependency.
 * If compositeId is found, it means adding this base would create a cycle.
 */
export function detectCycle(
  compositeId: number | null,
  baseSkillIds: number[]
): string[] | null {
  if (compositeId === null) return null;

  function walkDown(skillId: number, visited: Set<number>, path: string[]): string[] | null {
    if (skillId === compositeId) {
      return [...path, getSkillName(compositeId)];
    }
    if (visited.has(skillId)) return null;
    visited.add(skillId);

    // Walk downward: get this skill's base dependencies
    const deps = db
      .select({ baseSkillId: skillCompositions.baseSkillId })
      .from(skillCompositions)
      .where(eq(skillCompositions.compositeSkillId, skillId))
      .all();

    for (const dep of deps) {
      const result = walkDown(dep.baseSkillId, visited, [...path, getSkillName(dep.baseSkillId)]);
      if (result) return result;
    }
    return null;
  }

  for (const baseId of baseSkillIds) {
    const result = walkDown(baseId, new Set(), [getSkillName(baseId)]);
    if (result) return result;
  }
  return null;
}

/**
 * Compute tier for a composite: max(base skill tiers) + 1.
 * Throws if tier exceeds MAX_TIER.
 */
export function computeTier(baseSkillIds: number[]): number {
  if (baseSkillIds.length === 0) return 0;

  let maxBaseTier = 0;
  for (const id of baseSkillIds) {
    const skill = db
      .select({ tier: toolsRegistry.tier })
      .from(toolsRegistry)
      .where(eq(toolsRegistry.id, id))
      .get();
    if (skill && skill.tier > maxBaseTier) {
      maxBaseTier = skill.tier;
    }
  }

  const newTier = maxBaseTier + 1;
  if (newTier > MAX_TIER) {
    throw new Error(`Tier depth ${newTier} exceeds maximum of ${MAX_TIER}`);
  }
  return newTier;
}

/**
 * Cascade tier recalculation to all downstream composites (BFS).
 * Also enforces MAX_TIER during cascade.
 */
export function cascadeTiers(skillId: number): void {
  const queue = [skillId];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    // Find composites that use currentId as a base (downstream consumers)
    const downstreamEdges = db
      .select({ compositeId: skillCompositions.compositeSkillId })
      .from(skillCompositions)
      .where(eq(skillCompositions.baseSkillId, currentId))
      .all();

    for (const edge of downstreamEdges) {
      const bases = db
        .select({ baseSkillId: skillCompositions.baseSkillId })
        .from(skillCompositions)
        .where(eq(skillCompositions.compositeSkillId, edge.compositeId))
        .all();

      const baseTiers = bases.map((b) => {
        const s = db.select({ tier: toolsRegistry.tier }).from(toolsRegistry).where(eq(toolsRegistry.id, b.baseSkillId)).get();
        return s?.tier ?? 0;
      });

      const newTier = Math.max(0, ...baseTiers) + 1;
      if (newTier > MAX_TIER) continue; // don't cascade beyond limit

      const current = db.select({ tier: toolsRegistry.tier }).from(toolsRegistry).where(eq(toolsRegistry.id, edge.compositeId)).get();

      if (current && current.tier !== newTier) {
        db.update(toolsRegistry)
          .set({ tier: newTier })
          .where(eq(toolsRegistry.id, edge.compositeId))
          .run();
        queue.push(edge.compositeId);
      }
    }
  }
}

/**
 * Validate a composition before saving.
 * Returns an error message or null if valid.
 */
export function validateComposition(
  compositeId: number | null,
  baseSkillIds: number[]
): string | null {
  if (baseSkillIds.length < 2) {
    return "A composite skill requires at least 2 base skills";
  }

  if (compositeId !== null && baseSkillIds.includes(compositeId)) {
    return "A skill cannot compose itself";
  }

  const cycle = detectCycle(compositeId, baseSkillIds);
  if (cycle) {
    return `Circular dependency detected: ${cycle.join(" → ")}`;
  }

  try {
    computeTier(baseSkillIds);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }

  return null;
}
