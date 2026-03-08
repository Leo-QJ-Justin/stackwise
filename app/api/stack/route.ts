import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { stackItems, toolsRegistry } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/stack — list stack items joined with tools_registry
export async function GET() {
  try {
    const items = await db
      .select({
        id: stackItems.id,
        toolId: stackItems.toolId,
        notes: stackItems.notes,
        addedAt: stackItems.addedAt,
        tool: {
          id: toolsRegistry.id,
          name: toolsRegistry.name,
          category: toolsRegistry.category,
          provides: toolsRegistry.provides,
          description: toolsRegistry.description,
          status: toolsRegistry.status,
          source: toolsRegistry.source,
          verdictReason: toolsRegistry.verdictReason,
          firstSeen: toolsRegistry.firstSeen,
          timesMentioned: toolsRegistry.timesMentioned,
          lastUpdated: toolsRegistry.lastUpdated,
          canonicalUrl: toolsRegistry.canonicalUrl,
        },
      })
      .from(stackItems)
      .innerJoin(toolsRegistry, eq(stackItems.toolId, toolsRegistry.id));

    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch stack" },
      { status: 500 }
    );
  }
}

// POST /api/stack — add toolId to stack and set tool status to active
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolId, notes } = body;

    if (!toolId) {
      return NextResponse.json(
        { error: "toolId is required" },
        { status: 400 }
      );
    }

    // Verify the tool exists
    const tool = await db
      .select()
      .from(toolsRegistry)
      .where(eq(toolsRegistry.id, toolId));

    if (tool.length === 0) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    // Add to stack
    const stackItem = await db
      .insert(stackItems)
      .values({ toolId, notes: notes ?? null })
      .returning();

    // Set tool status to active
    await db
      .update(toolsRegistry)
      .set({ status: "active", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(toolsRegistry.id, toolId));

    return NextResponse.json(stackItem[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add to stack" },
      { status: 500 }
    );
  }
}

// PATCH /api/stack — update notes for a stack item
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolId, notes } = body;

    if (!toolId) {
      return NextResponse.json(
        { error: "toolId is required" },
        { status: 400 }
      );
    }

    if (typeof notes !== "string") {
      return NextResponse.json(
        { error: "notes must be a string" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(stackItems)
      .set({ notes: notes || null })
      .where(eq(stackItems.toolId, toolId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Tool not found in stack" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update notes" },
      { status: 500 }
    );
  }
}

// DELETE /api/stack — remove toolId from stack
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { toolId } = body;

    if (!toolId) {
      return NextResponse.json(
        { error: "toolId is required" },
        { status: 400 }
      );
    }

    const deleted = await db
      .delete(stackItems)
      .where(eq(stackItems.toolId, toolId))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Tool not found in stack" },
        { status: 404 }
      );
    }

    // Archive the tool so it doesn't reappear as active
    await db
      .update(toolsRegistry)
      .set({ status: "archived", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(toolsRegistry.id, toolId));

    return NextResponse.json(deleted[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to remove from stack" },
      { status: 500 }
    );
  }
}
