"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Link as LinkIcon, Merge, FileText, Copy, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { GraphData } from "@/lib/types";

const TIER_NODE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  0: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  1: { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400" },
  2: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
};

function nodeColors(tier: number) {
  return TIER_NODE_COLORS[Math.min(tier, 2)] ?? TIER_NODE_COLORS[2];
}

interface Props {
  skillId: number;
  onNavigate: (id: number) => void;
  refreshKey: number;
}

export function FocusGraph({ skillId, onNavigate, refreshKey }: Props) {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Content overlay state
  const [showContent, setShowContent] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [contentPath, setContentPath] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setShowContent(false);
    setContent(null);
    setContentPath(null);
    fetch(`/api/skills/${skillId}/graph`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Server error: ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setData(d); })
      .catch((err) => {
        console.error("[FocusGraph] Failed to load graph:", err);
        setData(null);
        setError(err instanceof Error ? err.message : "Failed to load graph data");
      })
      .finally(() => setLoading(false));
  }, [skillId, refreshKey]);

  const handleCenterClick = () => {
    if (showContent) {
      setShowContent(false);
      return;
    }
    setShowContent(true);
    if (content === null) {
      setContentLoading(true);
      fetch(`/api/skills/${skillId}/content`)
        .then((r) => r.json())
        .then((data) => {
          setContent(data.content ?? null);
          setContentPath(data.path ?? null);
        })
        .catch(() => setContent(null))
        .finally(() => setContentLoading(false));
    }
  };

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-6 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-sm text-red-400">{error ?? "Failed to load graph data"}</p>
      </div>
    );
  }

  const { skill, dependsOn, usedBy } = data;
  const centerColors = nodeColors(skill.tier);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex flex-col items-center gap-6 p-8">
          {/* DEPENDS ON section */}
          {dependsOn.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Depends On
              </span>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {dependsOn.map((node) => {
                  const colors = nodeColors(node.tier);
                  const isBroken = node.status !== "active";
                  return (
                    <button
                      key={node.id}
                      onClick={() => onNavigate(node.id)}
                      className={`cursor-pointer group relative flex flex-col items-center gap-1 rounded-lg border px-4 py-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${colors.bg} ${colors.border} ${isBroken ? "opacity-50" : ""}`}
                    >
                      <span className="absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full bg-muted border border-border font-mono text-[9px] font-bold text-foreground">
                        {node.position}
                      </span>
                      {isBroken && (
                        <AlertTriangle className="absolute -top-2 -right-2 size-4 text-amber-500" />
                      )}
                      <span className={`font-mono text-[11px] font-medium ${colors.text} group-hover:text-foreground transition-colors`}>
                        {node.name}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/50">
                        Tier {node.tier}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1">
                {dependsOn.map((_, i) => (
                  <div key={i} className="h-6 w-px bg-border" />
                ))}
              </div>
              <div className="h-4 w-px bg-border" />
            </div>
          )}

          {/* CENTER NODE — clickable to view content */}
          <button
            onClick={handleCenterClick}
            className={`cursor-pointer group relative flex flex-col items-center gap-2 rounded-xl border-2 px-8 py-5 shadow-lg transition-all duration-200 hover:shadow-xl ${centerColors.bg} ${centerColors.border} ${showContent ? "ring-2 ring-primary/40" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className={`font-mono text-base font-bold ${centerColors.text}`}>
                {skill.name}
              </span>
              {skill.mergeType && (
                <Badge variant="outline" className={`text-[9px] font-mono gap-0.5 ${
                  skill.mergeType === "orchestrator"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/25"
                }`}>
                  {skill.mergeType === "orchestrator" ? (
                    <><LinkIcon className="size-2" /> ORCH</>
                  ) : (
                    <><Merge className="size-2" /> MUT</>
                  )}
                </Badge>
              )}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              Tier {skill.tier} · {skill.capabilityType} · {skill.source}
            </span>
            {skill.description && (
              <p className="max-w-sm text-center text-xs text-muted-foreground mt-1">
                {skill.description}
              </p>
            )}
            {/* Hint to click */}
            <span className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground/40 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <FileText className="size-2.5" />
              Click to view instructions
            </span>
          </button>

          {/* USED BY section */}
          {usedBy.length > 0 && (
            <div className="flex flex-col items-center gap-3">
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1">
                {usedBy.map((_, i) => (
                  <div key={i} className="h-6 w-px bg-border" />
                ))}
              </div>

              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Used By
              </span>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {usedBy.map((node) => {
                  const colors = nodeColors(node.tier);
                  return (
                    <button
                      key={node.id}
                      onClick={() => onNavigate(node.id)}
                      className={`cursor-pointer group flex flex-col items-center gap-1 rounded-lg border px-4 py-3 transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${colors.bg} ${colors.border}`}
                    >
                      <span className={`font-mono text-[11px] font-medium ${colors.text} group-hover:text-foreground transition-colors`}>
                        {node.name}
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/50">
                        Tier {node.tier}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No dependencies and no dependents */}
          {dependsOn.length === 0 && usedBy.length === 0 && (
            <p className="mt-4 font-mono text-xs text-muted-foreground/50">
              Base skill — no dependencies or dependents
            </p>
          )}

          {/* Generation prompt */}
          {skill.generationPrompt && (
            <div className="mt-6 w-full max-w-lg rounded-lg border border-border bg-muted/30 p-4">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                Generation Intent
              </span>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {skill.generationPrompt}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Content overlay — slides up from bottom on center node click */}
      {showContent && (
        <div className="absolute inset-0 z-10 flex flex-col overflow-hidden bg-background/95 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex items-center gap-2">
              <FileText className="size-3.5 text-muted-foreground/60" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Skill Instructions
              </span>
              {contentPath && (
                <span className="font-mono text-[10px] text-muted-foreground/40 truncate max-w-[300px]">
                  {contentPath}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {content && (
                <button
                  onClick={handleCopy}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2.5 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              )}
              <button
                onClick={() => setShowContent(false)}
                className="cursor-pointer inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Content body */}
          <div className="flex-1 overflow-y-auto">
            {contentLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="size-5 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
              </div>
            ) : content ? (
              <pre className="whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed text-muted-foreground">
                {content}
              </pre>
            ) : (
              <p className="px-5 py-16 text-center font-mono text-xs text-muted-foreground/50">
                No skill file found on disk
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
