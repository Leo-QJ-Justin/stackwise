"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Link as LinkIcon, Merge, GitBranch } from "lucide-react";

interface GraphData {
  skill: {
    id: number;
    name: string;
    tier: number;
    mergeType: string | null;
    description: string | null;
    skillPath: string | null;
    generationPrompt: string | null;
    capabilityType: string;
    source: string;
  };
  dependsOn: { id: number; name: string; position: number }[];
  usedBy: { id: number; name: string }[];
}

const TIER_COLORS: Record<number, string> = {
  0: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  1: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  2: "bg-amber-500/15 text-amber-400 border-amber-500/25",
};

function tierBadgeClass(tier: number) {
  return TIER_COLORS[Math.min(tier, 2)] ?? TIER_COLORS[2];
}

interface Props {
  skillId: number;
  onExtend: (skillId: number, currentBaseIds: number[]) => void;
  refreshKey: number;
}

export function SkillDetailHeader({ skillId, onExtend, refreshKey }: Props) {
  const [data, setData] = useState<GraphData | null>(null);

  useEffect(() => {
    fetch(`/api/skills/${skillId}/graph`)
      .then((r) => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => setData(null));
  }, [skillId, refreshKey]);

  if (!data) {
    return (
      <div className="flex items-center gap-4 border-b border-border px-6 py-4">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const { skill, dependsOn, usedBy } = data;
  const isComposite = skill.mergeType !== null;

  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="flex items-center gap-3">
        <h2 className="font-mono text-sm font-bold text-foreground">
          {skill.name}
        </h2>

        <Badge variant="outline" className={`text-[10px] font-mono ${tierBadgeClass(skill.tier)}`}>
          Tier {skill.tier}
        </Badge>

        {skill.mergeType && (
          <Badge variant="outline" className={`text-[10px] font-mono gap-1 ${
            skill.mergeType === "orchestrator"
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
              : "bg-rose-500/10 text-rose-400 border-rose-500/25"
          }`}>
            {skill.mergeType === "orchestrator" ? (
              <><LinkIcon className="size-2.5" /> Orchestrator</>
            ) : (
              <><Merge className="size-2.5" /> Mutation</>
            )}
          </Badge>
        )}

        {isComposite && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {dependsOn.length} base{dependsOn.length !== 1 ? "s" : ""}
            {usedBy.length > 0 && ` · used by ${usedBy.length}`}
          </span>
        )}

        {skill.description && (
          <span className="hidden lg:inline text-xs text-muted-foreground truncate max-w-[300px]">
            {skill.description}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {isComposite && (
          <button
            onClick={() => onExtend(skillId, dependsOn.map((d) => d.id))}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-1.5 font-mono text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <GitBranch className="size-3" />
            Extend
          </button>
        )}
      </div>
    </div>
  );
}
