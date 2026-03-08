import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  toolsRegistry,
  ingestedContent,
  duplicatesLog,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { classifyAndStore } from "@/lib/classify";

// POST /api/ingest — receive processed content from n8n automation pipeline
export async function POST(request: NextRequest) {
  let body: {
    sourceUrl: string;
    postType: string;
    rawText: string;
    tools: string[];
    creatorHandle?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { sourceUrl, postType, rawText, tools } = body;

  if (!sourceUrl || !postType || !rawText || !Array.isArray(tools) || tools.length === 0) {
    return NextResponse.json(
      { error: "Missing required fields: sourceUrl, postType, rawText, tools (non-empty array)" },
      { status: 400 }
    );
  }

  // Check for duplicate source URL
  const existing = db
    .select()
    .from(ingestedContent)
    .where(eq(ingestedContent.sourceUrl, sourceUrl))
    .get();

  if (existing) {
    return NextResponse.json(
      { skipped: true, message: "Content already ingested", contentId: existing.id },
      { status: 200 }
    );
  }

  // Insert ingested content
  const [content] = db
    .insert(ingestedContent)
    .values({
      sourceUrl,
      postType,
      rawText,
    })
    .returning()
    .all();

  let classified = 0;
  let duplicates = 0;
  let skipped = 0;
  const results: Array<{ tool: string; status: string }> = [];

  for (const toolName of tools) {
    const trimmed = toolName.trim();
    if (!trimmed) {
      skipped++;
      continue;
    }

    // Check if tool already exists in registry (normalized match)
    const existingTool = db
      .select()
      .from(toolsRegistry)
      .where(
        sql`lower(replace(${toolsRegistry.name}, '-', ' ')) = lower(replace(${trimmed}, '-', ' '))`
      )
      .get();

    if (existingTool) {
      // Increment times_mentioned
      db.update(toolsRegistry)
        .set({
          timesMentioned: sql`${toolsRegistry.timesMentioned} + 1`,
          lastUpdated: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(toolsRegistry.id, existingTool.id))
        .run();

      // Log to duplicates_log with content reference
      db.insert(duplicatesLog)
        .values({
          contentId: content.id,
          verdict: "KNOWN",
          mappedToName: existingTool.name,
          reason: `Already in registry (status: ${existingTool.status})`,
        })
        .run();

      // Link content to first matched tool
      if (!content.mappedToToolId) {
        db.update(ingestedContent)
          .set({ mappedToToolId: existingTool.id })
          .where(eq(ingestedContent.id, content.id))
          .run();
      }

      duplicates++;
      results.push({ tool: trimmed, status: `known:${existingTool.status}` });
    } else {
      // Classify unknown tool
      try {
        const { tool, verdict } = await classifyAndStore({
          name: trimmed,
          description: rawText.slice(0, 500),
        });

        // Link content to newly classified tool
        db.update(ingestedContent)
          .set({
            mappedToToolId: tool.id,
            claudeVerdict: verdict ? JSON.stringify(verdict) : null,
          })
          .where(eq(ingestedContent.id, content.id))
          .run();

        classified++;
        results.push({ tool: trimmed, status: verdict?.verdict ?? "classified" });
      } catch (err) {
        console.error(`[ingest] classification failed for "${trimmed}":`, err);
        // Insert without classification so it's not lost
        const [tool] = db
          .insert(toolsRegistry)
          .values({
            name: trimmed,
            status: "unclassified",
            source: "community",
            category: "Development",
          })
          .returning()
          .all();

        db.update(ingestedContent)
          .set({ mappedToToolId: tool.id })
          .where(eq(ingestedContent.id, content.id))
          .run();

        skipped++;
        results.push({ tool: trimmed, status: "unclassified" });
      }
    }
  }

  return NextResponse.json(
    {
      ingested: content.id,
      classified,
      duplicates,
      skipped,
      results,
    },
    { status: 201 }
  );
}
