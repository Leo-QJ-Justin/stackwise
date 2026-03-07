import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// GET /api/tools/[id] — get a single tool
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const toolId = parseInt(id, 10);

    if (isNaN(toolId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const result = await db
      .select()
      .from(toolsRegistry)
      .where(eq(toolsRegistry.id, toolId));

    if (result.length === 0) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch tool" },
      { status: 500 }
    );
  }
}

// DELETE /api/tools/[id] — archive a tool (set status to "archived")
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const toolId = parseInt(id, 10);

    if (isNaN(toolId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const result = await db
      .update(toolsRegistry)
      .set({ status: "archived", lastUpdated: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(toolsRegistry.id, toolId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to archive tool" },
      { status: 500 }
    );
  }
}
