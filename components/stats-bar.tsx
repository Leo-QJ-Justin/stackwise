"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  Clock,
  ArrowRightLeft,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface StatsData {
  activeTools: number;
  pendingReview: number;
  totalTools: number;
  swapsThisWeek: number;
  categoryCoverage: Record<string, number>;
  missingCategories: string[];
  lastScanTime: string | null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function StatsBar({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        setStats(await res.json());
      } else {
        console.error("[stats-bar] Failed to fetch stats:", res.status);
        setError(true);
      }
    } catch (err) {
      console.error("[stats-bar] Stats request failed:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats, refreshKey]);

  // Skeleton placeholder for a single metric
  const Skeleton = () => (
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 rounded-full bg-muted-foreground/20 animate-pulse" />
      <div className="h-3.5 w-16 rounded bg-muted-foreground/20 animate-pulse" />
    </div>
  );

  return (
    <div>
      {/* Main stats strip */}
      <div className="flex items-center gap-6 border-b border-border bg-muted/30 px-6 py-2">
        {loading ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : error ? (
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-red-500" />
            <span className="font-mono text-[11px] text-red-500">
              Failed to load stats
            </span>
          </div>
        ) : stats ? (
          <>
            {/* Active tools */}
            <div className="flex items-center gap-2 transition-all duration-200">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-green-500" />
              </span>
              <Layers className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-[12px] text-foreground">
                {stats.activeTools}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                active
              </span>
            </div>

            {/* Pending review */}
            <div className="flex items-center gap-2 transition-all duration-200">
              <CheckCircle2
                className={`size-3.5 ${
                  stats.pendingReview > 0
                    ? "text-amber-500"
                    : "text-muted-foreground"
                }`}
              />
              <span
                className={`font-mono text-[12px] ${
                  stats.pendingReview > 0
                    ? "text-amber-500"
                    : "text-foreground"
                }`}
              >
                {stats.pendingReview}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                pending
              </span>
            </div>

            {/* Swaps this week */}
            <div className="flex items-center gap-2 transition-all duration-200">
              <ArrowRightLeft className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-[12px] text-foreground">
                {stats.swapsThisWeek}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                swaps this week
              </span>
            </div>

            {/* Missing categories */}
            <div
              className="flex items-center gap-2 transition-all duration-200"
              title={
                stats.missingCategories.length > 0
                  ? `Empty: ${stats.missingCategories.join(", ")}`
                  : "All categories covered"
              }
            >
              <AlertTriangle
                className={`size-3.5 ${
                  stats.missingCategories.length > 0
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
              />
              <span
                className={`font-mono text-[12px] ${
                  stats.missingCategories.length > 0
                    ? "text-red-500"
                    : "text-foreground"
                }`}
              >
                {stats.missingCategories.length}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                gaps
              </span>
            </div>

            {/* Last update time */}
            <div className="ml-auto flex items-center gap-2 transition-all duration-200">
              <Clock className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-[11px] text-muted-foreground">
                {stats.lastScanTime
                  ? relativeTime(stats.lastScanTime)
                  : "no activity"}
              </span>
            </div>
          </>
        ) : null}
      </div>

      {/* Gap analysis bar */}
      {!loading &&
        stats &&
        stats.missingCategories.length > 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-red-500/[0.04] px-6 py-1.5 transition-all duration-200">
            <AlertTriangle className="size-3 text-red-500/70 shrink-0" />
            <span className="font-mono text-[11px] text-red-500/80">
              No tools in:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {stats.missingCategories.map((cat) => (
                <Badge
                  key={cat}
                  variant="outline"
                  className="border-red-500/20 bg-red-500/[0.06] text-[10px] text-red-400"
                >
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
