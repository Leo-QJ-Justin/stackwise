import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

// GET /api/skills — list all composable units (skills, MCP servers, commands)
export async function GET() {
  try {
    const skills = await db
      .select()
      .from(toolsRegistry)
      .where(sql`${toolsRegistry.capabilityType} IN ('skill', 'mcp_server', 'command')`);

    return NextResponse.json(skills);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
