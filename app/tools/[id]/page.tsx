import { db } from "@/lib/db";
import { toolsRegistry, stackItems, swapHistory } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ToolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const toolId = parseInt(id);

  const tool = await db
    .select()
    .from(toolsRegistry)
    .where(eq(toolsRegistry.id, toolId))
    .get();

  if (!tool) {
    notFound();
  }

  const stackEntry = await db
    .select()
    .from(stackItems)
    .where(eq(stackItems.toolId, toolId))
    .get();

  const swaps = await db
    .select()
    .from(swapHistory)
    .where(
      or(eq(swapHistory.oldToolId, toolId), eq(swapHistory.newToolId, toolId))
    )
    .all();

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6 gap-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{tool.name}</h1>
        {tool.pluginType && (
          <Badge variant="secondary">{tool.pluginType}</Badge>
        )}
        <Badge
          variant={
            tool.status === "adopted"
              ? "default"
              : tool.status === "rejected"
                ? "destructive"
                : "outline"
          }
        >
          {tool.status}
        </Badge>
      </div>

      {tool.description && (
        <p className="mt-3 text-muted-foreground">{tool.description}</p>
      )}

      <Separator className="my-6" />

      <div className="grid gap-4">
        <div>
          <span className="font-mono text-xs uppercase text-muted-foreground">
            Category
          </span>
          <p>{tool.category}</p>
        </div>

        <div>
          <span className="font-mono text-xs uppercase text-muted-foreground">
            Source
          </span>
          <p>{tool.source}</p>
        </div>

        <div>
          <span className="font-mono text-xs uppercase text-muted-foreground">
            First Seen
          </span>
          <p>{tool.firstSeen}</p>
        </div>

        {tool.canonicalUrl && (
          <div>
            <span className="font-mono text-xs uppercase text-muted-foreground">
              URL
            </span>
            <p>
              <a
                href={tool.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {tool.canonicalUrl}
              </a>
            </p>
          </div>
        )}

        {stackEntry?.notes && (
          <div>
            <span className="font-mono text-xs uppercase text-muted-foreground">
              Notes
            </span>
            <p>{stackEntry.notes}</p>
          </div>
        )}

        {tool.verdictReason && (
          <div>
            <span className="font-mono text-xs uppercase text-muted-foreground">
              Verdict Reason
            </span>
            <p>{tool.verdictReason}</p>
          </div>
        )}
      </div>

      {swaps.length > 0 && (
        <>
          <Separator className="my-6" />
          <div>
            <h2 className="mb-4 font-mono text-lg font-semibold">
              Swap History
            </h2>
            <div className="grid gap-3">
              {swaps.map((swap) => (
                <div
                  key={swap.id}
                  className="rounded-md border bg-card p-3 text-sm"
                >
                  <p>
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      Old Tool ID:
                    </span>{" "}
                    {swap.oldToolId}
                    {" → "}
                    <span className="font-mono text-xs uppercase text-muted-foreground">
                      New Tool ID:
                    </span>{" "}
                    {swap.newToolId}
                  </p>
                  {swap.reason && (
                    <p className="mt-1 text-muted-foreground">{swap.reason}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {swap.swappedAt}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
