import { db } from "@/lib/db";
import { stackItems, toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SnapshotPreview } from "@/components/snapshot-preview";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { parseProvides } from "@/lib/classify";
import { CATEGORIES } from "@/lib/shared";

export default async function ExportPage() {
  const rows = await db
    .select({
      name: toolsRegistry.name,
      category: toolsRegistry.category,
      provides: toolsRegistry.provides,
      description: toolsRegistry.description,
    })
    .from(stackItems)
    .innerJoin(toolsRegistry, eq(stackItems.toolId, toolsRegistry.id))
    .all();

  const categories = CATEGORIES;

  const grouped: Record<string, typeof rows> = {};
  for (const cat of categories) {
    grouped[cat] = [];
  }
  for (const row of rows) {
    const cat = categories.includes(row.category) ? row.category : "misc";
    grouped[cat].push(row);
  }

  const today = new Date().toISOString().split("T")[0];

  let markdown = `# My Claude Stack\n\n_Exported on ${today}_\n`;

  for (const cat of categories) {
    const items = grouped[cat];
    if (items.length === 0) continue;
    markdown += `\n## ${cat}\n\n`;
    for (const item of items) {
      const parsed = parseProvides(item.provides);
      const providesLabel = parsed.length > 0
        ? ` (${parsed.slice(0, 2).join(", ")})`
        : "";
      const desc = item.description ? ` — ${item.description}` : "";
      markdown += `- **${item.name}**${providesLabel}${desc}\n`;
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-2xl font-bold">Stack Snapshot</h1>
      <p className="mt-2 mb-6 text-muted-foreground">
        Preview and export your current tool stack as Markdown.
      </p>

      <SnapshotPreview markdown={markdown} />
    </div>
  );
}
