"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  Sparkles,
  Save,
  Loader2,
  Link as LinkIcon,
  Merge,
} from "lucide-react";


interface SkillInfo {
  id: number;
  name: string;
  tier: number;
  description: string | null;
}

interface Props {
  selectedBaseIds: number[];
  extendingSkillId: number | null;
  onClose: () => void;
  onSaved: () => void;
  onReorderBases: (ids: number[]) => void;
}

type DrawerState = "idle" | "generating" | "preview" | "saving";

export function ComposeDrawer({
  selectedBaseIds,
  extendingSkillId,
  onClose,
  onSaved,
  onReorderBases,
}: Props) {
  const [state, setState] = useState<DrawerState>("idle");
  const [name, setName] = useState("");
  const [mergeType, setMergeType] = useState<"orchestrator" | "mutation">("orchestrator");
  const [intent, setIntent] = useState("");
  const [skillDir, setSkillDir] = useState("~/.claude/skills");
  const [generatedContent, setGeneratedContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [baseSkills, setBaseSkills] = useState<SkillInfo[]>([]);

  // Load base skill info
  useEffect(() => {
    if (selectedBaseIds.length === 0) {
      setBaseSkills([]);
      return;
    }
    // Fetch info for each selected skill
    Promise.all(
      selectedBaseIds.map((id) =>
        fetch(`/api/skills/${id}/graph`)
          .then((r) => {
            if (!r.ok) throw new Error(`Failed to load skill #${id}`);
            return r.json();
          })
          .then((data) => ({
            id: data.skill.id,
            name: data.skill.name,
            tier: data.skill.tier,
            description: data.skill.description,
          } as SkillInfo))
          .catch((err) => {
            console.error("[ComposeDrawer] Failed to load base skill:", err);
            return null;
          })
      )
    ).then((results) => {
      const loaded = results.filter((r): r is SkillInfo => r !== null);
      setBaseSkills(loaded);
      if (loaded.length < selectedBaseIds.length) {
        setError(`${selectedBaseIds.length - loaded.length} base skill(s) failed to load`);
      }
    });
  }, [selectedBaseIds]);

  // Pre-populate when extending
  useEffect(() => {
    if (extendingSkillId) {
      fetch(`/api/skills/${extendingSkillId}/graph`)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load skill #${extendingSkillId}`);
          return r.json();
        })
        .then((data) => {
          setName(data.skill.name);
          setMergeType((data.skill.mergeType as "orchestrator" | "mutation") ?? "orchestrator");
          setIntent(data.skill.generationPrompt ?? "");
        })
        .catch((err) => {
          console.error("[ComposeDrawer] Failed to pre-populate extend data:", err);
          setError("Failed to load skill data for extending");
        });
    }
  }, [extendingSkillId]);

  const moveSkill = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= selectedBaseIds.length) return;
    const newIds = [...selectedBaseIds];
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    onReorderBases(newIds);
  };

  const removeSkill = (id: number) => {
    onReorderBases(selectedBaseIds.filter((x) => x !== id));
  };

  const handleGenerate = async () => {
    if (!name.trim() || !intent.trim() || selectedBaseIds.length < 2) {
      setError("Name, intent, and at least 2 base skills are required");
      return;
    }

    setState("generating");
    setError(null);

    try {
      const endpoint = extendingSkillId
        ? `/api/skills/${extendingSkillId}/regenerate`
        : "/api/skills/compose";

      const body = extendingSkillId
        ? { baseSkillIds: selectedBaseIds, intent }
        : { name, baseSkillIds: selectedBaseIds, mergeType, intent, skillDir };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setGeneratedContent(data.generatedContent);
      setState("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setState("idle");
    }
  };

  const handleSave = async () => {
    setState("saving");
    setError(null);

    try {
      const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".md";
      // ~ is resolved server-side in the save route
      const skillPath = `${skillDir}/${filename}`;

      const res = await fetch("/api/skills/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: extendingSkillId,
          name,
          content: generatedContent,
          baseSkillIds: selectedBaseIds,
          mergeType,
          intent,
          skillPath,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Save failed");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setState("preview");
    }
  };

  return (
    <div className="flex w-96 flex-col border-l border-border bg-card shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-mono text-sm font-bold text-foreground">
          {extendingSkillId ? "Extend Composite" : "Compose Skills"}
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {/* Selected skills list */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Base Skills ({selectedBaseIds.length})
            </label>
            {baseSkills.length === 0 ? (
              <p className="mt-2 rounded-md border border-dashed border-border p-3 text-center font-mono text-[11px] text-muted-foreground/50">
                Select skills from the sidebar
              </p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {baseSkills.map((skill, i) => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[9px] font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-mono text-[11px] text-foreground">
                      {skill.name}
                    </span>
                    <button
                      onClick={() => moveSkill(i, -1)}
                      disabled={i === 0}
                      className="cursor-pointer p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="size-3" />
                    </button>
                    <button
                      onClick={() => moveSkill(i, 1)}
                      disabled={i === baseSkills.length - 1}
                      className="cursor-pointer p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="size-3" />
                    </button>
                    <button
                      onClick={() => removeSkill(skill.id)}
                      className="cursor-pointer p-0.5 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Merge type toggle */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Merge Type
            </label>
            <div className="mt-1.5 flex rounded-md border border-border bg-muted/30">
              <button
                onClick={() => setMergeType("orchestrator")}
                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 rounded-l-md py-2 font-mono text-[11px] font-medium transition-colors ${
                  mergeType === "orchestrator"
                    ? "bg-emerald-500/15 text-emerald-400 border-r border-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground border-r border-border"
                }`}
              >
                <LinkIcon className="size-3" />
                Orchestrator
              </button>
              <button
                onClick={() => setMergeType("mutation")}
                className={`cursor-pointer flex-1 flex items-center justify-center gap-1.5 rounded-r-md py-2 font-mono text-[11px] font-medium transition-colors ${
                  mergeType === "mutation"
                    ? "bg-rose-500/15 text-rose-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Merge className="size-3" />
                Mutation
              </button>
            </div>
          </div>

          {/* Name input */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Composite Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., QA-pipeline"
              className="mt-1.5 h-8 font-mono text-xs"
            />
          </div>

          {/* Intent textarea */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Intent
            </label>
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Describe what this composite should do..."
              className="mt-1.5 min-h-[80px] font-mono text-xs resize-none"
            />
          </div>

          {/* Skill directory */}
          <div>
            <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Save Directory
            </label>
            <Input
              value={skillDir}
              onChange={(e) => setSkillDir(e.target.value)}
              className="mt-1.5 h-8 font-mono text-xs"
            />
          </div>

          {/* Generate button */}
          {state === "idle" && (
            <Button
              onClick={handleGenerate}
              disabled={selectedBaseIds.length < 2 || !name.trim() || !intent.trim()}
              className="cursor-pointer w-full gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Sparkles className="size-3.5" />
              Generate Composite
            </Button>
          )}

          {state === "generating" && (
            <Button disabled className="w-full gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              Generating...
            </Button>
          )}

          {/* Preview / Editor */}
          {(state === "preview" || state === "saving") && (
            <>
              <div>
                <label className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Generated Content (editable)
                </label>
                <Textarea
                  value={generatedContent}
                  onChange={(e) => setGeneratedContent(e.target.value)}
                  className="mt-1.5 min-h-[200px] font-mono text-xs resize-y"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer flex-1 gap-1.5"
                  disabled={state === "saving"}
                >
                  <Sparkles className="size-3" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleSave}
                  size="sm"
                  className="cursor-pointer flex-1 gap-1.5 bg-primary hover:bg-primary/90"
                  disabled={state === "saving"}
                >
                  {state === "saving" ? (
                    <><Loader2 className="size-3 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="size-3" /> Save Skill</>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="font-mono text-[11px] text-red-400">{error}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
