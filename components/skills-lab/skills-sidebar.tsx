"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Search, Link as LinkIcon, Merge, AlertTriangle } from "lucide-react";
import type { SkillListItem } from "@/app/skills/page";

const TIER_COLORS: Record<number, { dot: string; text: string; bg: string }> = {
  0: { dot: "bg-blue-500", text: "text-blue-400", bg: "bg-blue-500/10" },
  1: { dot: "bg-violet-500", text: "text-violet-400", bg: "bg-violet-500/10" },
  2: { dot: "bg-amber-500", text: "text-amber-400", bg: "bg-amber-500/10" },
};

function tierColor(tier: number) {
  return TIER_COLORS[Math.min(tier, 2)] ?? TIER_COLORS[2];
}

interface Props {
  selectedSkillId: number | null;
  onSelectSkill: (id: number) => void;
  composeMode: boolean;
  selectedBaseIds: number[];
  onToggleBase: (id: number) => void;
  onStartCompose: () => void;
  refreshKey: number;
}

export function SkillsSidebar({
  selectedSkillId,
  onSelectSkill,
  composeMode,
  selectedBaseIds,
  onToggleBase,
  onStartCompose,
  refreshKey,
}: Props) {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/skills")
      .then((r) => r.json())
      .then((data) => {
        setSkills(data.skills ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Filter by search and only show active skills
  const filtered = skills
    .filter((s) => s.status === "active")
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  // Group by tier
  const grouped = new Map<number, SkillListItem[]>();
  for (const skill of filtered) {
    const tier = skill.tier ?? 0;
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier)!.push(skill);
  }
  const sortedTiers = [...grouped.keys()].sort((a, b) => a - b);

  return (
    <div className="flex w-72 flex-col border-r border-border bg-muted/20">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <Button
          size="sm"
          className="cursor-pointer w-full gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          onClick={onStartCompose}
        >
          <Sparkles className="size-3.5" />
          {composeMode ? "Composing..." : "Compose Skills"}
        </Button>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {/* Skills list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {loading ? (
            <div className="space-y-2 p-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 rounded bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center font-mono text-xs text-muted-foreground">
              {search ? "No matching skills" : "No skills found. Run a scan first."}
            </p>
          ) : (
            sortedTiers.map((tier) => (
              <div key={tier} className="mb-3">
                {/* Tier header */}
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className={`size-2 rounded-full ${tierColor(tier).dot}`} />
                  <span className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${tierColor(tier).text}`}>
                    Tier {tier} {tier === 0 ? "— Base" : tier === 1 ? "— Composite" : "— Advanced"}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/50">
                    ({grouped.get(tier)!.length})
                  </span>
                </div>

                {/* Skill items */}
                {grouped.get(tier)!.map((skill) => {
                  const isSelected = selectedSkillId === skill.id;
                  const isChecked = selectedBaseIds.includes(skill.id);
                  const isBroken = skill.baseSkills.length > 0 && skill.status !== "active";

                  return (
                    <button
                      key={skill.id}
                      onClick={() => {
                        if (composeMode) {
                          onToggleBase(skill.id);
                        } else {
                          onSelectSkill(skill.id);
                        }
                      }}
                      className={`cursor-pointer flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150
                        ${isSelected && !composeMode ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}
                        ${isChecked && composeMode ? "bg-violet-500/15 ring-1 ring-violet-500/30" : ""}
                      `}
                    >
                      {/* Checkbox in compose mode */}
                      {composeMode && (
                        <div className={`size-4 shrink-0 rounded border transition-colors ${
                          isChecked
                            ? "border-violet-500 bg-violet-500"
                            : "border-muted-foreground/30"
                        } flex items-center justify-center`}>
                          {isChecked && (
                            <svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] font-medium text-foreground">
                            {skill.name}
                          </span>
                          {isBroken && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                        </div>

                        {/* Merge type + used by count */}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {skill.mergeType && (
                            <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase ${
                              skill.mergeType === "orchestrator"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-rose-500/15 text-rose-400"
                            }`}>
                              {skill.mergeType === "orchestrator" ? (
                                <><LinkIcon className="size-2" /> ORCH</>
                              ) : (
                                <><Merge className="size-2" /> MUT</>
                              )}
                            </span>
                          )}
                          {skill.usedByCount > 0 && (
                            <span className="font-mono text-[9px] text-muted-foreground/50">
                              used by {skill.usedByCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Compose mode footer */}
      {composeMode && selectedBaseIds.length > 0 && (
        <div className="border-t border-border bg-violet-500/5 px-4 py-2">
          <span className="font-mono text-[11px] text-violet-400">
            {selectedBaseIds.length} skills selected
          </span>
        </div>
      )}
    </div>
  );
}
