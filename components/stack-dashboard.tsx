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
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import { CATEGORIES, parseProvides } from "@/lib/shared";

interface ToolData {
  id: number;
  name: string;
  category: string;
  provides: string | null;
  description: string | null;
  source?: string | null;
  verdictReason?: string | null;
  replacesToolId?: number | null;
}

const CATEGORY_BORDER_COLOR: Record<string, string> = {
  "Development": "border-l-blue-500",
  "Skills & File Handling": "border-l-violet-500",
  "Integrations": "border-l-emerald-500",
  "Workflow & Agents": "border-l-amber-500",
  "Prompting & Context": "border-l-rose-500",
  "Research & Knowledge": "border-l-cyan-500",
  "UI & Frontend": "border-l-pink-500",
  "My Skills": "border-l-orange-500",
};

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

// ── Draggable tool card ─────────────────────────────────────────
function DraggableToolRow({
  item,
  onRemove,
  onUpdateNotes,
}: {
  item: StackItem;
  onRemove: (toolId: number) => void;
  onUpdateNotes: (toolId: number, notes: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tool-${item.tool.id}`,
    data: { tool: item.tool },
  });

  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState(item.notes ?? "");

  const handleSave = () => {
    onUpdateNotes(item.tool.id, draft);
    setEditingNotes(false);
  };

  const handleCancel = () => {
    setDraft(item.notes ?? "");
    setEditingNotes(false);
  };

  const borderColor =
    CATEGORY_BORDER_COLOR[item.tool.category] ?? "border-l-gray-500";
  const sourceLabel = item.tool.source ?? "community";

  return (
    <div
      ref={setNodeRef}
      className={`group/tool px-4 py-1.5 ${isDragging ? "opacity-30" : ""}`}
    >
      <div
        className={`rounded-lg border border-border/60 border-l-[3px] ${borderColor} bg-card/50 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_2px_6px_rgba(0,0,0,0.08)]`}
      >
        <div className="flex items-center gap-1 px-3 py-2">
          <button
            {...listeners}
            {...attributes}
            className="shrink-0 cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            title="Drag to re-categorize"
          >
            <GripVertical className="size-3" />
          </button>
          <Link
            href={`/tools/${item.tool.id}`}
            className="group flex flex-1 items-start gap-2.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted/40 cursor-pointer min-w-0"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-medium group-hover:text-primary transition-colors">
                  {item.tool.name}
                </span>
                {item.tool.provides && (
                  <ProvidesHint provides={item.tool.provides} />
                )}
                <Badge
                  variant="outline"
                  className="ml-auto border-border/50 bg-muted/40 text-[9px] text-muted-foreground/70 px-1.5 py-0"
                >
                  {sourceLabel}
                </Badge>
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
            onClick={() => onRemove(item.tool.id)}
            title="Remove from stack"
          >
            <X className="size-3" />
          </Button>
        </div>

        {/* Inline notes */}
        <div className="px-3 pb-2 pl-9">
          {editingNotes ? (
            <div className="flex flex-col gap-1">
              <textarea
                rows={2}
                className="w-full resize-none rounded border border-border bg-muted/30 px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
              />
              <div className="flex items-center gap-1">
                <Button
                  size="xs"
                  variant="ghost"
                  className="cursor-pointer font-mono text-[10px] text-primary"
                  onClick={handleSave}
                >
                  Save
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="cursor-pointer font-mono text-[10px] text-muted-foreground"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : item.notes ? (
            <button
              className="cursor-pointer text-left font-mono text-xs italic text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              onClick={() => {
                setDraft(item.notes ?? "");
                setEditingNotes(true);
              }}
            >
              {item.notes}
            </button>
          ) : (
            <button
              className="cursor-pointer font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors opacity-0 group-hover/tool:opacity-100"
              onClick={() => {
                setDraft("");
                setEditingNotes(true);
              }}
            >
              Add note
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Droppable category header ───────────────────────────────────
function DroppableCategoryHeader({
  cat,
  count,
  suggestionCount,
  isExpanded,
  onToggle,
  isOver,
}: {
  cat: string;
  count: number;
  suggestionCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `category-${cat}` });

  return (
    <div ref={setNodeRef}>
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 px-6 py-3 text-left transition-colors cursor-pointer ${
          isOver
            ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
            : "hover:bg-muted/40"
        }`}
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
          {count}
        </span>
        {isOver && (
          <span className="font-mono text-[10px] text-primary animate-pulse">
            Drop here
          </span>
        )}
        {suggestionCount > 0 && (
          <Badge
            variant="outline"
            className="ml-auto border-primary/25 bg-primary/5 text-[10px] text-primary"
          >
            +{suggestionCount}
          </Badge>
        )}
      </button>
    </div>
  );
}

// ── Main dashboard ──────────────────────────────────────────────
export function StackDashboard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [stackItems, setStackItems] = useState<StackItem[]>([]);
  const [suggested, setSuggested] = useState<ToolData[]>([]);
  const [evaluated, setEvaluated] = useState<ToolData[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(CATEGORIES)
  );
  const [activeDrag, setActiveDrag] = useState<ToolData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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

  const handleUpdateNotes = async (toolId: number, notes: string) => {
    const res = await fetch("/api/stack", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId, notes }),
    });
    if (res.ok) {
      setStackItems((prev) =>
        prev.map((item) =>
          item.toolId === toolId ? { ...item, notes: notes || null } : item
        )
      );
    }
  };

  const handleRecategorize = async (toolId: number, newCategory: string) => {
    await fetch("/api/tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: toolId, category: newCategory }),
    });
    loadData();
  };

  const onDragStart = (event: DragStartEvent) => {
    const tool = event.active.data.current?.tool as ToolData | undefined;
    if (tool) setActiveDrag(tool);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const tool = active.data.current?.tool as ToolData | undefined;
    if (!tool) return;

    const targetId = String(over.id);
    if (!targetId.startsWith("category-")) return;

    const newCategory = targetId.replace("category-", "");
    if (newCategory !== tool.category) {
      handleRecategorize(tool.id, newCategory);
    }
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
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
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

          // Show all categories during drag so user has targets; otherwise only categories with content
          const hasContent =
            activeDrag !== null ||
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
            <CategorySection
              key={cat}
              cat={cat}
              catStack={catStack}
              isExpanded={isExpanded}
              suggestionCount={suggestionCount}
              onToggle={() => toggleCat(cat)}
              onRemove={handleRemove}
              onUpdateNotes={handleUpdateNotes}
              replacementMap={replacementMap}
              evaluatedReplacementMap={evaluatedReplacementMap}
              catPureSuggestions={catPureSuggestions}
              catPureEvaluated={catPureEvaluated}
              onAccept={handleAccept}
              onSwap={handleSwap}
              onSkip={handleSkip}
            />
          );
        })}
      </div>

      {/* Drag overlay — floating preview while dragging */}
      <DragOverlay>
        {activeDrag && (
          <div className="rounded-md border border-primary/30 bg-background px-4 py-2 shadow-lg">
            <div className="flex items-center gap-2">
              <GripVertical className="size-3 text-primary" />
              <span className="font-mono text-[13px] font-medium">
                {activeDrag.name}
              </span>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ── Category section (extracted for useDroppable) ───────────────
function CategorySection({
  cat,
  catStack,
  isExpanded,
  suggestionCount,
  onToggle,
  onRemove,
  onUpdateNotes,
  replacementMap,
  evaluatedReplacementMap,
  catPureSuggestions,
  catPureEvaluated,
  onAccept,
  onSwap,
  onSkip,
}: {
  cat: string;
  catStack: StackItem[];
  isExpanded: boolean;
  suggestionCount: number;
  onToggle: () => void;
  onRemove: (toolId: number) => void;
  onUpdateNotes: (toolId: number, notes: string) => void;
  replacementMap: Map<number, ToolData[]>;
  evaluatedReplacementMap: Map<number, ToolData[]>;
  catPureSuggestions: ToolData[];
  catPureEvaluated: ToolData[];
  onAccept: (id: number) => void;
  onSwap: (oldToolId: number, newToolId: number) => void;
  onSkip: (id: number) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `category-${cat}` });

  return (
    <div
      ref={setNodeRef}
      className={`border-b border-border last:border-b-0 transition-colors ${
        isOver ? "bg-primary/[0.04]" : ""
      }`}
    >
      {/* Category header */}
      <button
        onClick={onToggle}
        className={`flex w-full items-center gap-2.5 px-6 py-3 text-left transition-colors cursor-pointer ${
          isOver
            ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
            : "hover:bg-muted/40"
        }`}
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
        {isOver && (
          <span className="font-mono text-[10px] text-primary animate-pulse">
            Drop here
          </span>
        )}
        {suggestionCount > 0 && !isOver && (
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
            const replacements = replacementMap.get(item.tool.id) ?? [];
            const rejectedReplacements =
              evaluatedReplacementMap.get(item.tool.id) ?? [];

            return (
              <div
                key={item.tool.id}
                className="grid grid-cols-2 min-h-[44px]"
              >
                {/* Left: stack tool (draggable) */}
                <DraggableToolRow item={item} onRemove={onRemove} onUpdateNotes={onUpdateNotes} />

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
                            onClick={() => onSwap(item.tool.id, repl.id)}
                          >
                            <ArrowRightLeft className="size-3" />
                            Swap
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="cursor-pointer text-muted-foreground"
                            onClick={() => onSkip(repl.id)}
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
                        onClick={() => onAccept(tool.id)}
                      >
                        <Plus className="size-3" />
                        Add
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="cursor-pointer text-muted-foreground"
                        onClick={() => onSkip(tool.id)}
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
}
