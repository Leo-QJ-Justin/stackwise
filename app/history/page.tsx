import { db } from "@/lib/db";
import { toolsRegistry, swapHistory, duplicatesLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const statusVariant = (status: string) => {
  switch (status) {
    case "active":
      return "default" as const;
    case "archived":
      return "secondary" as const;
    case "evaluated_rejected":
      return "destructive" as const;
    case "queue":
      return "outline" as const;
    default:
      return "outline" as const;
  }
};

export default async function HistoryPage() {
  const tools = await db
    .select()
    .from(toolsRegistry)
    .orderBy(desc(toolsRegistry.lastUpdated))
    .all();

  const swaps = await db
    .select()
    .from(swapHistory)
    .orderBy(desc(swapHistory.swappedAt))
    .all();

  const dupes = await db
    .select()
    .from(duplicatesLog)
    .orderBy(desc(duplicatesLog.loggedAt))
    .all();

  // Build tool name lookup for swap history
  const toolMap = new Map(tools.map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="font-mono text-2xl font-bold">History</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Full view of every tool, swap, and classification decision.
      </p>

      {/* ── All Tools ── */}
      <section className="mb-10">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.15em] text-primary mb-4">
          All Tools ({tools.length})
        </h2>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Category
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Source
                </th>
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Last Updated
                </th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <tr
                  key={tool.id}
                  className="border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/tools/${tool.id}`}
                      className="font-mono text-[13px] font-medium hover:text-primary transition-colors"
                    >
                      {tool.name}
                    </Link>
                    {tool.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground/70 truncate max-w-[280px]">
                        {tool.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {tool.category}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusVariant(tool.status)} className="text-[10px]">
                      {tool.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {tool.source}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground/60">
                    {tool.lastUpdated}
                  </td>
                </tr>
              ))}
              {tools.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No tools in the database yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Swap History ── */}
      {swaps.length > 0 && (
        <section className="mb-10">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.15em] text-primary mb-4">
            Swap History ({swaps.length})
          </h2>
          <div className="grid gap-2">
            {swaps.map((swap) => (
              <div
                key={swap.id}
                className="flex items-center gap-3 rounded-md border border-border px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-[13px] line-through text-muted-foreground">
                  {toolMap.get(swap.oldToolId!) ?? `#${swap.oldToolId}`}
                </span>
                <span className="text-xs text-muted-foreground">→</span>
                <span className="font-mono text-[13px] font-medium">
                  {toolMap.get(swap.newToolId!) ?? `#${swap.newToolId}`}
                </span>
                {swap.reason && (
                  <span className="ml-auto text-xs text-muted-foreground/70 truncate max-w-[300px]">
                    {swap.reason}
                  </span>
                )}
                <span className="ml-auto font-mono text-[11px] text-muted-foreground/50 shrink-0">
                  {swap.swappedAt}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Classification Log ── */}
      {dupes.length > 0 && (
        <section className="mb-10">
          <h2 className="font-mono text-sm font-semibold uppercase tracking-[0.15em] text-primary mb-4">
            Classification Log ({dupes.length})
          </h2>
          <div className="grid gap-2">
            {dupes.map((entry) => (
              <div
                key={entry.id}
                className="rounded-md border border-border px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      entry.verdict.includes("DUPLICATE")
                        ? "destructive"
                        : "outline"
                    }
                    className="text-[10px]"
                  >
                    {entry.verdict}
                  </Badge>
                  {entry.mappedToName && (
                    <span className="font-mono text-xs text-muted-foreground">
                      → {entry.mappedToName}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground/50">
                    {entry.loggedAt}
                  </span>
                </div>
                {entry.reason && (
                  <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed">
                    {entry.reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
