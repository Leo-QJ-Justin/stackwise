import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET /api/skills — list tools where source = "self_created"
export async function GET() {
  try {
    const skills = await db
      .select()
      .from(toolsRegistry)
      .where(eq(toolsRegistry.source, "self_created"));

    return NextResponse.json(skills);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
