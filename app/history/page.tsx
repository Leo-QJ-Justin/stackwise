import { db } from "@/lib/db";
import { toolsRegistry, swapHistory, duplicatesLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRightLeft, Eye, Wrench } from "lucide-react";
import Link from "next/link";

/* ── helpers ── */

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

/** Dot color for each event type / status */
const dotColor = (type: string, status?: string) => {
  if (type === "swap") return "bg-amber-500";
  if (type === "classification") return "bg-blue-500";
  // tool events — color by status
  switch (status) {
    case "active":
      return "bg-green-500";
    case "archived":
      return "bg-gray-400";
    case "queue":
      return "bg-amber-500";
    case "evaluated_rejected":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
};

/** Format an ISO-ish timestamp into a relative / short label.
 *  Works server-side without Intl.RelativeTimeFormat locale issues. */
function formatRelativeDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  // Older than a week — show "Mar 5" style
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/* ── unified event type ── */

type TimelineEvent =
  | {
      type: "tool";
      date: string;
      id: number;
      name: string;
      category: string;
      status: string;
      source: string;
      description: string | null;
    }
  | {
      type: "swap";
      date: string;
      id: number;
      oldName: string;
      newName: string;
      oldToolId: number | null;
      newToolId: number | null;
      reason: string | null;
    }
  | {
      type: "classification";
      date: string;
      id: number;
      verdict: string;
      mappedToName: string | null;
      reason: string | null;
    };

/* ── page ── */

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

  // Merge into a single timeline
  const events: TimelineEvent[] = [
    ...tools.map(
      (t): TimelineEvent => ({
        type: "tool",
        date: t.lastUpdated,
        id: t.id,
        name: t.name,
        category: t.category,
        status: t.status,
        source: t.source,
        description: t.description,
      })
    ),
    ...swaps.map(
      (s): TimelineEvent => ({
        type: "swap",
        date: s.swappedAt,
        id: s.id,
        oldName: toolMap.get(s.oldToolId!) ?? `#${s.oldToolId}`,
        newName: toolMap.get(s.newToolId!) ?? `#${s.newToolId}`,
        oldToolId: s.oldToolId,
        newToolId: s.newToolId,
        reason: s.reason,
      })
    ),
    ...dupes.map(
      (d): TimelineEvent => ({
        type: "classification",
        date: d.loggedAt,
        id: d.id,
        verdict: d.verdict,
        mappedToName: d.mappedToName,
        reason: d.reason,
      })
    ),
  ];

  // Sort by date descending (most recent first)
  events.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

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

      {events.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No events recorded yet.
        </p>
      ) : (
        <div className="relative">
          {/* vertical line */}
          <div className="absolute left-[99px] top-0 bottom-0 w-px bg-border" />

          <ol className="space-y-6">
            {events.map((event, idx) => (
              <li key={`${event.type}-${event.id}`} className="relative flex gap-6">
                {/* ── date column ── */}
                <div className="w-[80px] shrink-0 pt-1 text-right">
                  <span className="font-mono text-[11px] text-muted-foreground/60">
                    {formatRelativeDate(event.date)}
                  </span>
                </div>

                {/* ── dot on the line ── */}
                <div className="relative flex shrink-0 items-start justify-center pt-1.5" style={{ width: "20px" }}>
                  <span
                    className={`z-10 block size-3 rounded-full ring-2 ring-background ${dotColor(
                      event.type,
                      event.type === "tool" ? event.status : undefined
                    )}`}
                  />
                </div>

                {/* ── event card ── */}
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 py-3">
                  {event.type === "tool" && <ToolCard event={event} />}
                  {event.type === "swap" && <SwapCard event={event} />}
                  {event.type === "classification" && (
                    <ClassificationCard event={event} />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/* ── card sub-components (server, no "use client") ── */

function ToolCard({
  event,
}: {
  event: Extract<TimelineEvent, { type: "tool" }>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="size-3.5 text-muted-foreground/60" />
        <Link
          href={`/tools/${event.id}`}
          className="font-mono text-[13px] font-medium hover:text-primary transition-colors"
        >
          {event.name}
        </Link>
        <Badge variant={statusVariant(event.status)} className="text-[10px]">
          {event.status}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground/50">
          {event.category}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground/40">
          {event.source}
        </span>
      </div>
      {event.description && (
        <p className="mt-1 text-xs text-muted-foreground/70 truncate">
          {event.description}
        </p>
      )}
    </>
  );
}

function SwapCard({
  event,
}: {
  event: Extract<TimelineEvent, { type: "swap" }>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ArrowRightLeft className="size-3.5 text-amber-500/80" />
        <span className="font-mono text-[13px] line-through text-muted-foreground">
          {event.oldToolId != null ? (
            <Link
              href={`/tools/${event.oldToolId}`}
              className="hover:text-primary transition-colors"
            >
              {event.oldName}
            </Link>
          ) : (
            event.oldName
          )}
        </span>
        <span className="text-xs text-muted-foreground">→</span>
        <span className="font-mono text-[13px] font-medium">
          {event.newToolId != null ? (
            <Link
              href={`/tools/${event.newToolId}`}
              className="hover:text-primary transition-colors"
            >
              {event.newName}
            </Link>
          ) : (
            event.newName
          )}
        </span>
        <Badge variant="outline" className="text-[10px] text-amber-600">
          swap
        </Badge>
      </div>
      {event.reason && (
        <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed">
          {event.reason}
        </p>
      )}
    </>
  );
}

function ClassificationCard({
  event,
}: {
  event: Extract<TimelineEvent, { type: "classification" }>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Eye className="size-3.5 text-blue-500/80" />
        <Badge
          variant={
            event.verdict.includes("DUPLICATE") ? "destructive" : "outline"
          }
          className="text-[10px]"
        >
          {event.verdict}
        </Badge>
        {event.mappedToName && (
          <span className="font-mono text-xs text-muted-foreground">
            → {event.mappedToName}
          </span>
        )}
        <Badge variant="outline" className="ml-auto text-[10px] text-blue-500">
          classification
        </Badge>
      </div>
      {event.reason && (
        <p className="mt-1 text-xs text-muted-foreground/70 leading-relaxed">
          {event.reason}
        </p>
      )}
    </>
  );
}
