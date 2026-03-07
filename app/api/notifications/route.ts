import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { duplicatesLog } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// GET /api/notifications — unreviewed duplicate/overlap entries
export async function GET() {
  try {
    const items = db
      .select()
      .from(duplicatesLog)
      .where(eq(duplicatesLog.reviewed, 0))
      .all();

    return NextResponse.json({
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("[notifications] Failed to fetch:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications — mark entries as reviewed
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      !ids.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)
    ) {
      return NextResponse.json(
        { error: "ids must be a non-empty array of positive integers" },
        { status: 400 }
      );
    }

    db.update(duplicatesLog)
      .set({ reviewed: 1 })
      .where(inArray(duplicatesLog.id, ids))
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[notifications] Failed to update:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
