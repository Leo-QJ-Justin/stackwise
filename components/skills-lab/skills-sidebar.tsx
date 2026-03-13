"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Search,
  Link as LinkIcon,
  Merge,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { SkillListItem, PluginGroup } from "@/lib/types";

const TIER_COLORS: Record<number, { dot: string; text: string }> = {
  0: { dot: "bg-blue-500", text: "text-blue-400" },
  1: { dot: "bg-violet-500", text: "text-violet-400" },
  2: { dot: "bg-amber-500", text: "text-amber-400" },
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

function SkillRow({
  skill,
  isSelected,
  composeMode,
  isChecked,
  onSelect,
  onToggle,
}: {
  skill: SkillListItem;
  isSelected: boolean;
  composeMode: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={composeMode ? onToggle : onSelect}
      className={`cursor-pointer flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150
        ${isSelected && !composeMode ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}
        ${isChecked && composeMode ? "bg-violet-500/15 ring-1 ring-violet-500/30" : ""}
      `}
    >
      {composeMode && (
        <div
          className={`size-4 shrink-0 rounded border transition-colors ${
            isChecked ? "border-violet-500 bg-violet-500" : "border-muted-foreground/30"
          } flex items-center justify-center`}
        >
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
          {skill.tier > 0 && (
            <span className={`shrink-0 font-mono text-[8px] font-bold ${tierColor(skill.tier).text}`}>
              T{skill.tier}
            </span>
          )}
          {skill.baseSkills.length > 0 && skill.status !== "active" && (
            <AlertTriangle className="size-3 text-amber-500 shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {skill.mergeType && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[8px] font-bold uppercase ${
                skill.mergeType === "orchestrator"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              {skill.mergeType === "orchestrator" ? (
                <>
                  <LinkIcon className="size-2" /> ORCH
                </>
              ) : (
                <>
                  <Merge className="size-2" /> MUT
                </>
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
}

function PluginSection({
  label,
  skills,
  isExpanded,
  onToggleExpand,
  selectedSkillId,
  composeMode,
  selectedBaseIds,
  onSelectSkill,
  onToggleBase,
  accent,
}: {
  label: string;
  skills: SkillListItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  selectedSkillId: number | null;
  composeMode: boolean;
  selectedBaseIds: number[];
  onSelectSkill: (id: number) => void;
  onToggleBase: (id: number) => void;
  accent?: boolean;
}) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggleExpand}
        className="cursor-pointer flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="size-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground shrink-0" />
        )}
        <span
          className={`font-mono text-[10px] font-semibold uppercase tracking-wider truncate ${
            accent ? "text-violet-400" : "text-muted-foreground"
          }`}
        >
          {label}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0">
          ({skills.length})
        </span>
      </button>

      {isExpanded && (
        <div className="ml-2">
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              isSelected={selectedSkillId === skill.id}
              composeMode={composeMode}
              isChecked={selectedBaseIds.includes(skill.id)}
              onSelect={() => onSelectSkill(skill.id)}
              onToggle={() => onToggleBase(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const [plugins, setPlugins] = useState<PluginGroup[]>([]);
  const [standalone, setStandalone] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["my-skills"]));

  const toggleExpand = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/skills")
      .then((r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setPlugins(data.plugins ?? []);
        setStandalone(data.standalone ?? []);
      })
      .catch((err) => {
        console.error("[SkillsSidebar] Failed to fetch skills:", err);
        setError("Failed to load skills");
      })
      .finally(() => setLoading(false));
  }, [refreshKey]);

  // Apply search filter
  const matchesSearch = (s: SkillListItem) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase());

  const filteredStandalone = standalone.filter(matchesSearch);
  const filteredPlugins = plugins
    .map((p) => ({ ...p, skills: p.skills.filter(matchesSearch) }))
    .filter((p) => p.skills.length > 0);

  const totalSkills =
    filteredStandalone.length +
    filteredPlugins.reduce((sum, p) => sum + p.skills.length, 0);

  // Auto-expand groups that contain search matches
  const isExpanded = (key: string) => (search ? true : expanded.has(key));

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
          ) : error ? (
            <div className="p-4 text-center">
              <p className="font-mono text-xs text-red-400">{error}</p>
              <button
                onClick={() => setLoading(true)}
                className="cursor-pointer mt-2 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                Retry
              </button>
            </div>
          ) : totalSkills === 0 ? (
            <p className="p-4 text-center font-mono text-xs text-muted-foreground">
              {search ? "No matching skills" : "No skills found. Run a scan first."}
            </p>
          ) : (
            <>
              {/* My Skills (standalone / self-created) */}
              {filteredStandalone.length > 0 && (
                <PluginSection
                  label="My Skills"
                  skills={filteredStandalone}
                  isExpanded={isExpanded("my-skills")}
                  onToggleExpand={() => toggleExpand("my-skills")}
                  selectedSkillId={selectedSkillId}
                  composeMode={composeMode}
                  selectedBaseIds={selectedBaseIds}
                  onSelectSkill={onSelectSkill}
                  onToggleBase={onToggleBase}
                  accent
                />
              )}

              {/* Plugin groups */}
              {filteredPlugins.map((plugin) => (
                <PluginSection
                  key={plugin.id}
                  label={plugin.name}
                  skills={plugin.skills}
                  isExpanded={isExpanded(`plugin-${plugin.id}`)}
                  onToggleExpand={() => toggleExpand(`plugin-${plugin.id}`)}
                  selectedSkillId={selectedSkillId}
                  composeMode={composeMode}
                  selectedBaseIds={selectedBaseIds}
                  onSelectSkill={onSelectSkill}
                  onToggleBase={onToggleBase}
                />
              ))}
            </>
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
