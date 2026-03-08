"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Search, Command, X } from "lucide-react";

interface Tool {
  id: number;
  name: string;
  category: string;
  description: string | null;
  status: string;
  source: string;
}

const STATUS_ORDER: Record<string, number> = {
  adopted: 0,
  active: 0,
  queue: 1,
  unclassified: 2,
  archived: 3,
  rejected: 4,
};

const STATUS_LABELS: Record<string, string> = {
  adopted: "Active",
  active: "Active",
  queue: "Queue",
  unclassified: "Unclassified",
  archived: "Archived",
  rejected: "Rejected",
};

function statusGroup(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "adopted" || status === "active") return "default";
  if (status === "queue" || status === "unclassified") return "secondary";
  if (status === "rejected") return "destructive";
  return "outline";
}

export function SearchModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open/close with Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Debounced search
  const search = useCallback(
    (q: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/tools");
          if (!res.ok) throw new Error("fetch failed");
          const tools: Tool[] = await res.json();

          const lowerQ = q.toLowerCase();
          const filtered = tools.filter(
            (t) =>
              t.name.toLowerCase().includes(lowerQ) ||
              t.category.toLowerCase().includes(lowerQ) ||
              (t.description && t.description.toLowerCase().includes(lowerQ))
          );

          // Sort by status group order
          filtered.sort(
            (a, b) =>
              (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
          );

          setResults(filtered);
          setSelectedIndex(0);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    []
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    search(value);
  }

  function navigateToTool(tool: Tool) {
    setOpen(false);
    router.push(`/tools/${tool.id}`);
  }

  function close() {
    setOpen(false);
  }

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      navigateToTool(results[selectedIndex]);
      return;
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(
      `[data-index="${selectedIndex}"]`
    );
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Group results by status for rendering
  const grouped: { label: string; tools: Tool[] }[] = [];
  for (const tool of results) {
    const label = statusGroup(tool.status);
    const existing = grouped.find((g) => g.label === label);
    if (existing) {
      existing.tools.push(tool);
    } else {
      grouped.push({ label, tools: [tool] });
    }
  }

  // Compute flat index for each tool across groups
  let flatIndex = 0;

  return (
    <>
      {/* Trigger hint -- render inline wherever SearchModal is placed */}
      <button
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Search className="size-3" />
        Search
        <kbd className="ml-1 flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[10px]">
          <Command className="size-2.5" />K
        </kbd>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={close}
          />

          {/* Modal */}
          <div
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder="Search tools, categories..."
                className="flex-1 bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                onClick={close}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[50vh] overflow-y-auto">
              {loading && (
                <div className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">
                  Searching...
                </div>
              )}

              {!loading && query.trim() && results.length === 0 && (
                <div className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">
                  No results found for &ldquo;{query}&rdquo;
                </div>
              )}

              {!loading && !query.trim() && (
                <div className="px-4 py-8 text-center font-mono text-sm text-muted-foreground">
                  Start typing to search...
                </div>
              )}

              {!loading &&
                grouped.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 bg-background px-4 py-1.5">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                    {group.tools.map((tool) => {
                      const idx = flatIndex++;
                      const isSelected = idx === selectedIndex;
                      return (
                        <button
                          key={tool.id}
                          data-index={idx}
                          onClick={() => navigateToTool(tool)}
                          className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected
                              ? "bg-muted/80"
                              : "hover:bg-muted/40"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-mono text-sm font-medium text-foreground">
                                {tool.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="shrink-0 font-mono text-[10px]"
                              >
                                {tool.category}
                              </Badge>
                              <Badge
                                variant={statusVariant(tool.status)}
                                className="shrink-0 font-mono text-[10px]"
                              >
                                {tool.status}
                              </Badge>
                            </div>
                            {tool.description && (
                              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                {tool.description.length > 100
                                  ? tool.description.slice(0, 100) + "..."
                                  : tool.description}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>

            {/* Footer hints */}
            <div className="flex items-center gap-4 border-t border-border px-4 py-2">
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                  &uarr;&darr;
                </kbd>
                navigate
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                  &crarr;
                </kbd>
                open
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                  esc
                </kbd>
                close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
