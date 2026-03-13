import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

// GET /api/tools — list tools, optionally filter by status and/or category
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const capabilityType = searchParams.get("capability_type");
    const parentPluginId = searchParams.get("parent_plugin_id");

    const conditions = [];
    if (status) {
      conditions.push(eq(toolsRegistry.status, status));
    }
    if (category) {
      conditions.push(eq(toolsRegistry.category, category));
    }
    if (capabilityType) {
      conditions.push(eq(toolsRegistry.capabilityType, capabilityType));
    }
    if (parentPluginId) {
      conditions.push(eq(toolsRegistry.parentPluginId, parseInt(parentPluginId, 10)));
    }

    const tools =
      conditions.length > 0
        ? await db
            .select()
            .from(toolsRegistry)
            .where(and(...conditions))
        : await db.select().from(toolsRegistry);

    return NextResponse.json(tools);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch tools" },
      { status: 500 }
    );
  }
}

// POST /api/tools — add a new tool
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, category, provides, description, status, source, verdictReason, canonicalUrl } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: "name and category are required" },
        { status: 400 }
      );
    }

    const result = await db.insert(toolsRegistry).values({
      name,
      category,
      provides: provides ?? null,
      description: description ?? null,
      status: status ?? "unclassified",
      source: source ?? "community",
      verdictReason: verdictReason ?? null,
      canonicalUrl: canonicalUrl ?? null,
    }).returning();

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create tool" },
      { status: 500 }
    );
  }
}

// PATCH /api/tools — update tool status/fields by id in body
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id is required in request body" },
        { status: 400 }
      );
    }

    const result = await db
      .update(toolsRegistry)
      .set({ ...updates, lastUpdated: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(toolsRegistry.id, id))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Tool not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update tool" },
      { status: 500 }
    );
  }
}
