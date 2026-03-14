import { db } from "@/lib/db";
import { stackItems, toolsRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SnapshotPreview } from "@/components/snapshot-preview";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function ExportPage() {
  const rows = await db
    .select({
      name: toolsRegistry.name,
      category: toolsRegistry.category,
      provides: toolsRegistry.provides,
      description: toolsRegistry.description,
      pluginKey: toolsRegistry.pluginKey,
      source: toolsRegistry.source,
      capabilityType: toolsRegistry.capabilityType,
    })
    .from(stackItems)
    .innerJoin(toolsRegistry, eq(stackItems.toolId, toolsRegistry.id))
    .all();

  // Separate tools into three groups
  const installablePlugins: typeof rows = [];
  const manualSetup: typeof rows = [];
  const selfCreated: typeof rows = [];

  for (const row of rows) {
    if (row.source === "self_created") {
      selfCreated.push(row);
    } else if (row.pluginKey) {
      installablePlugins.push(row);
    } else {
      manualSetup.push(row);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  let markdown = `# My Claude Stack\n\n_Exported on ${today}_\n`;

  if (installablePlugins.length > 0) {
    markdown += `\n## Install Commands\n\n\`\`\`bash\n`;
    for (const item of installablePlugins) {
      markdown += `claude plugin install ${item.pluginKey}\n`;
    }
    markdown += `\`\`\`\n`;
  }

  if (manualSetup.length > 0) {
    markdown += `\n## MCP Servers (manual setup)\n\n`;
    for (const item of manualSetup) {
      const desc = item.description ? ` — ${item.description}` : "";
      markdown += `- ${item.name}${desc}\n`;
    }
  }

  if (selfCreated.length > 0) {
    markdown += `\n## Self-Created Skills\n\n`;
    for (const item of selfCreated) {
      const desc = item.description ? ` — ${item.description}` : "";
      markdown += `- ${item.name}${desc}\n`;
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
