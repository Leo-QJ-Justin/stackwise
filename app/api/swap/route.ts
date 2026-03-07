import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry, stackItems, swapHistory } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// POST /api/swap — record a swap: insert to swap_history, remove old from stack,
// archive old tool, add new to stack, activate new tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { oldToolId, newToolId, reason } = body;

    if (!oldToolId || !newToolId) {
      return NextResponse.json(
        { error: "oldToolId and newToolId are required" },
        { status: 400 }
      );
    }

    // Verify both tools exist
    const oldTool = await db
      .select()
      .from(toolsRegistry)
      .where(eq(toolsRegistry.id, oldToolId));
    const newTool = await db
      .select()
      .from(toolsRegistry)
      .where(eq(toolsRegistry.id, newToolId));

    if (oldTool.length === 0) {
      return NextResponse.json(
        { error: "Old tool not found" },
        { status: 404 }
      );
    }
    if (newTool.length === 0) {
      return NextResponse.json(
        { error: "New tool not found" },
        { status: 404 }
      );
    }

    // 1. Insert swap record
    const swap = await db
      .insert(swapHistory)
      .values({
        oldToolId,
        newToolId,
        reason: reason ?? null,
      })
      .returning();

    // 2. Remove old tool from stack
    await db.delete(stackItems).where(eq(stackItems.toolId, oldToolId));

    // 3. Archive old tool
    await db
      .update(toolsRegistry)
      .set({ status: "archived", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(toolsRegistry.id, oldToolId));

    // 4. Add new tool to stack
    await db.insert(stackItems).values({ toolId: newToolId });

    // 5. Activate new tool
    await db
      .update(toolsRegistry)
      .set({ status: "active", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(toolsRegistry.id, newToolId));

    return NextResponse.json(swap[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Swap failed" },
      { status: 500 }
    );
  }
}
