"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plus,
  X,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { CATEGORIES, parseProvides } from "@/lib/shared";

interface ToolData {
  id: number;
  name: string;
  category: string;
  provides: string | null;
  description: string | null;
  verdictReason?: string | null;
  replacesToolId?: number | null;
}

interface StackItem {
  id: number;
  toolId: number;
  notes: string | null;
  addedAt: string;
  tool: ToolData;
}

function ProvidesHint({ provides }: { provides: string }) {
  const items = parseProvides(provides);
  if (items.length === 0) return null;
  return (
    <span className="text-[10px] text-muted-foreground/70">
      {items.slice(0, 2).join(" · ")}
    </span>
  );
}

export function StackDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stackItems, setStackItems] = useState<StackItem[]>([]);
  const [suggested, setSuggested] = useState<ToolData[]>([]);
  const [evaluated, setEvaluated] = useState<ToolData[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(CATEGORIES)
  );

  const loadData = useCallback(async () => {
    const [stackRes, suggestedRes, evaluatedRes] = await Promise.all([
      fetch("/api/stack"),
      fetch("/api/tools?status=queue"),
      fetch("/api/tools?status=evaluated_rejected"),
    ]);
    if (stackRes.ok) setStackItems(await stackRes.json());
    if (suggestedRes.ok) setSuggested(await suggestedRes.json());
    if (evaluatedRes.ok) setEvaluated(await evaluatedRes.json());
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleAccept = async (id: number) => {
    await fetch("/api/stack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: id }),
    });
    loadData();
  };

  const handleSwap = async (oldToolId: number, newToolId: number) => {
    await fetch("/api/swap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldToolId, newToolId }),
    });
    loadData();
  };

  const handleSkip = async (id: number) => {
    await fetch("/api/tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "evaluated_rejected" }),
    });
    loadData();
  };

  const handleRemove = async (toolId: number) => {
    await fetch("/api/stack", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId }),
    });
    loadData();
  };

  // Build a map: stackToolId -> replacement suggestions
  const replacementMap = new Map<number, ToolData[]>();
  const pureSuggestions: ToolData[] = [];

  for (const tool of suggested) {
    if (
      tool.replacesToolId &&
      stackItems.some((s) => s.tool.id === tool.replacesToolId)
    ) {
      const existing = replacementMap.get(tool.replacesToolId) ?? [];
      existing.push(tool);
      replacementMap.set(tool.replacesToolId, existing);
    } else {
      pureSuggestions.push(tool);
    }
  }

  // Same for evaluated
  const evaluatedReplacementMap = new Map<number, ToolData[]>();
  const pureEvaluated: ToolData[] = [];

  for (const tool of evaluated) {
    if (
      tool.replacesToolId &&
      stackItems.some((s) => s.tool.id === tool.replacesToolId)
    ) {
      const existing = evaluatedReplacementMap.get(tool.replacesToolId) ?? [];
      existing.push(tool);
      evaluatedReplacementMap.set(tool.replacesToolId, existing);
    } else {
      pureEvaluated.push(tool);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Column headers */}
      <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="px-6 py-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            My Stack
          </span>
        </div>
        <div className="border-l border-border px-6 py-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Intelligence Feed
          </span>
        </div>
      </div>

      {/* Category rows */}
      {CATEGORIES.map((cat) => {
        const catStack = stackItems.filter((s) => s.tool.category === cat);
        const catPureSuggestions = pureSuggestions.filter(
          (t) => t.category === cat
        );
        const catPureEvaluated = pureEvaluated.filter(
          (t) => t.category === cat
        );
        const catHasReplacements = catStack.some(
          (s) =>
            replacementMap.has(s.tool.id) ||
            evaluatedReplacementMap.has(s.tool.id)
        );

        const hasContent =
          catStack.length > 0 ||
          catPureSuggestions.length > 0 ||
          catPureEvaluated.length > 0 ||
          catHasReplacements;

        if (!hasContent) return null;

        const isExpanded = expandedCats.has(cat);
        const suggestionCount =
          catPureSuggestions.length +
          catStack.reduce(
            (n, s) => n + (replacementMap.get(s.tool.id)?.length ?? 0),
            0
          );

        return (
          <div key={cat} className="border-b border-border last:border-b-0">
            {/* Category header */}
            <button
              onClick={() => toggleCat(cat)}
              className="flex w-full items-center gap-2.5 px-6 py-3 text-left transition-colors hover:bg-muted/40 cursor-pointer"
            >
              {isExpanded ? (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 text-muted-foreground" />
              )}
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.15em] text-primary">
                {cat}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {catStack.length}
              </span>
              {suggestionCount > 0 && (
                <Badge
                  variant="outline"
                  className="ml-auto border-primary/25 bg-primary/5 text-[10px] text-primary"
                >
                  +{suggestionCount}
                </Badge>
              )}
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="pb-1">
                {/* Row per stack item (with aligned replacements) */}
                {catStack.map((item) => {
                  const replacements =
                    replacementMap.get(item.tool.id) ?? [];
                  const rejectedReplacements =
                    evaluatedReplacementMap.get(item.tool.id) ?? [];

                  return (
                    <div
                      key={item.tool.id}
                      className="grid grid-cols-2 min-h-[44px]"
                    >
                      {/* Left: stack tool */}
                      <div className="group/tool px-4 py-1">
                        <div className="flex items-center gap-1">
                          <Link
                            href={`/tools/${item.tool.id}`}
                            className="group flex flex-1 items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50 cursor-pointer"
                          >
                            <div className="h-1.5 w-1.5 mt-[7px] shrink-0 rounded-full bg-primary/60" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[13px] font-medium group-hover:text-primary transition-colors">
                                  {item.tool.name}
                                </span>
                                {item.tool.provides && (
                                  <ProvidesHint provides={item.tool.provides} />
                                )}
                              </div>
                              {item.tool.description && (
                                <p className="mt-0.5 text-xs text-muted-foreground/80 leading-relaxed truncate">
                                  {item.tool.description}
                                </p>
                              )}
                            </div>
                          </Link>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="cursor-pointer text-muted-foreground opacity-0 group-hover/tool:opacity-100 transition-opacity shrink-0"
                            onClick={() => handleRemove(item.tool.id)}
                            title="Remove from stack"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Right: replacement suggestion(s) aligned to this tool */}
                      <div className="border-l border-border px-4 py-1">
                        {replacements.map((repl) => (
                          <div
                            key={repl.id}
                            className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <ArrowRightLeft className="size-3 text-amber-400 shrink-0" />
                                  <span className="font-mono text-[13px] font-medium">
                                    {repl.name}
                                  </span>
                                  {repl.provides && (
                                    <ProvidesHint provides={repl.provides} />
                                  )}
                                </div>
                                {repl.description && (
                                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                    {repl.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center gap-1 pt-0.5">
                                <Button
                                  size="xs"
                                  className="cursor-pointer gap-1 bg-amber-600 hover:bg-amber-500 text-white"
                                  onClick={() =>
                                    handleSwap(item.tool.id, repl.id)
                                  }
                                >
                                  <ArrowRightLeft className="size-3" />
                                  Swap
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="cursor-pointer text-muted-foreground"
                                  onClick={() => handleSkip(repl.id)}
                                >
                                  <X className="size-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {rejectedReplacements.map((repl) => (
                          <div
                            key={repl.id}
                            className="rounded-lg px-3 py-2 opacity-50"
                          >
                            <div className="flex items-center gap-2">
                              <ArrowRightLeft className="size-3 text-muted-foreground shrink-0" />
                              <span className="font-mono text-[13px] line-through">
                                {repl.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="border-destructive/30 text-[10px] text-destructive"
                              >
                                rejected
                              </Badge>
                            </div>
                            {repl.verdictReason && (
                              <p className="mt-0.5 ml-5 text-xs text-muted-foreground">
                                {repl.verdictReason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Pure suggestions (not replacing anything) */}
                {catPureSuggestions.map((tool) => (
                  <div key={tool.id} className="grid grid-cols-2 min-h-[44px]">
                    <div className="px-4 py-1" />
                    <div className="border-l border-border px-4 py-1">
                      <div className="rounded-lg border border-primary/15 bg-primary/[0.03] px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[13px] font-medium">
                                {tool.name}
                              </span>
                              {tool.provides && (
                                <ProvidesHint provides={tool.provides} />
                              )}
                            </div>
                            {tool.description && (
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                {tool.description}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1 pt-0.5">
                            <Button
                              size="xs"
                              variant="default"
                              className="cursor-pointer gap-1"
                              onClick={() => handleAccept(tool.id)}
                            >
                              <Plus className="size-3" />
                              Add
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              className="cursor-pointer text-muted-foreground"
                              onClick={() => handleSkip(tool.id)}
                            >
                              <X className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pure evaluated (not replacing anything) */}
                {catPureEvaluated.map((tool) => (
                  <div key={tool.id} className="grid grid-cols-2 min-h-[44px]">
                    <div className="px-4 py-1" />
                    <div className="border-l border-border px-4 py-1">
                      <div className="rounded-lg px-3 py-2 opacity-50">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[13px] line-through">
                            {tool.name}
                          </span>
                          <Badge
                            variant="outline"
                            className="border-destructive/30 text-[10px] text-destructive"
                          >
                            rejected
                          </Badge>
                        </div>
                        {tool.verdictReason && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {tool.verdictReason}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
