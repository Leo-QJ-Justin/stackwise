import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, swapHistory } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { CATEGORIES } from "@/lib/shared";

export async function GET() {
  try {
    const activeTools = db
      .select({ count: sql<number>`count(*)` })
      .from(toolsRegistry)
      .where(eq(toolsRegistry.status, "active"))
      .get()?.count ?? 0;

    const pendingReview = db
      .select({ count: sql<number>`count(*)` })
      .from(toolsRegistry)
      .where(eq(toolsRegistry.status, "queue"))
      .get()?.count ?? 0;

    const totalTools = db
      .select({ count: sql<number>`count(*)` })
      .from(toolsRegistry)
      .get()?.count ?? 0;

    const swapsThisWeek = db
      .select({ count: sql<number>`count(*)` })
      .from(swapHistory)
      .where(sql`${swapHistory.swappedAt} >= datetime('now', '-7 days')`)
      .get()?.count ?? 0;

    // Count active tools per category
    const categoryRows = db
      .select({
        category: toolsRegistry.category,
        count: sql<number>`count(*)`,
      })
      .from(toolsRegistry)
      .where(eq(toolsRegistry.status, "active"))
      .groupBy(toolsRegistry.category)
      .all();

    const categoryCoverage: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      categoryCoverage[cat] = 0;
    }
    for (const row of categoryRows) {
      categoryCoverage[row.category] = row.count;
    }

    const missingCategories = CATEGORIES.filter(
      (cat) => (categoryCoverage[cat] ?? 0) === 0
    );

    // Most recent tool update time (used as proxy for last activity)
    const lastUpdateRow = db
      .select({ lastUpdated: toolsRegistry.lastUpdated })
      .from(toolsRegistry)
      .orderBy(sql`${toolsRegistry.lastUpdated} desc`)
      .limit(1)
      .get();

    const lastScanTime = lastUpdateRow?.lastUpdated ?? null;

    return NextResponse.json({
      activeTools,
      pendingReview,
      totalTools,
      swapsThisWeek,
      categoryCoverage,
      missingCategories,
      lastScanTime,
    });
  } catch (error) {
    console.error("[stats] Failed to compute stats:", error);
    return NextResponse.json(
      { error: "Failed to compute stats" },
      { status: 500 }
    );
  }
}
