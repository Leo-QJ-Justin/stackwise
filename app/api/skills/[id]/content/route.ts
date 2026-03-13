import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import os from "os";

// GET /api/skills/[id]/content — read the SKILL.md file content from disk
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid skill ID" }, { status: 400 });
    }

    const skill = db
      .select({ skillPath: toolsRegistry.skillPath, name: toolsRegistry.name })
      .from(toolsRegistry)
      .where(eq(toolsRegistry.id, id))
      .get();

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if (!skill.skillPath) {
      return NextResponse.json({ content: null, reason: "no_path" });
    }

    // Resolve ~ to home directory
    const resolved = skill.skillPath.startsWith("~")
      ? path.join(os.homedir(), skill.skillPath.slice(1))
      : skill.skillPath;

    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ content: null, reason: "file_not_found", path: skill.skillPath });
    }

    const content = fs.readFileSync(resolved, "utf-8");
    return NextResponse.json({ content, path: skill.skillPath });
  } catch (error) {
    console.error("[skills/content] Failed:", error);
    return NextResponse.json({ error: "Failed to read skill content" }, { status: 500 });
  }
}
