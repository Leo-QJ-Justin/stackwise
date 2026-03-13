"use client";

import { useState, useCallback } from "react";
import { TopBar } from "@/components/top-bar";
import { SkillsSidebar } from "@/components/skills-lab/skills-sidebar";
import { FocusGraph } from "@/components/skills-lab/focus-graph";
import { ComposeDrawer } from "@/components/skills-lab/compose-drawer";
import { SkillDetailHeader } from "@/components/skills-lab/skill-detail-header";

export interface SkillListItem {
  id: number;
  name: string;
  tier: number;
  mergeType: string | null;
  capabilityType: string;
  source: string;
  status: string;
  description: string | null;
  skillPath: string | null;
  generationPrompt: string | null;
  baseSkills: { id: number; name: string; position: number }[];
  usedByCount: number;
}

export default function SkillsPage() {
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [composeMode, setComposeMode] = useState(false);
  const [selectedBaseIds, setSelectedBaseIds] = useState<number[]>([]);
  const [extendingSkillId, setExtendingSkillId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleCompose = () => {
    setComposeMode(true);
    setExtendingSkillId(null);
    setSelectedBaseIds([]);
  };

  const handleExtend = (skillId: number, currentBaseIds: number[]) => {
    setComposeMode(true);
    setExtendingSkillId(skillId);
    setSelectedBaseIds(currentBaseIds);
  };

  const handleCloseCompose = () => {
    setComposeMode(false);
    setExtendingSkillId(null);
    setSelectedBaseIds([]);
  };

  const handleSaved = () => {
    handleCloseCompose();
    refresh();
  };

  const toggleBaseSkill = (id: number) => {
    setSelectedBaseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <SkillsSidebar
          selectedSkillId={selectedSkillId}
          onSelectSkill={setSelectedSkillId}
          composeMode={composeMode}
          selectedBaseIds={selectedBaseIds}
          onToggleBase={toggleBaseSkill}
          onStartCompose={handleCompose}
          refreshKey={refreshKey}
        />

        {/* Right Panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedSkillId ? (
            <>
              <SkillDetailHeader
                skillId={selectedSkillId}
                onExtend={handleExtend}
                refreshKey={refreshKey}
              />
              <FocusGraph
                skillId={selectedSkillId}
                onNavigate={setSelectedSkillId}
                refreshKey={refreshKey}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <p className="font-mono text-sm text-muted-foreground">
                  Select a skill to view its dependency graph
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground/60">
                  or click &quot;Compose Skills&quot; to create a new composite
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Compose Drawer */}
        {composeMode && (
          <ComposeDrawer
            selectedBaseIds={selectedBaseIds}
            extendingSkillId={extendingSkillId}
            onClose={handleCloseCompose}
            onSaved={handleSaved}
            onReorderBases={setSelectedBaseIds}
          />
        )}
      </div>
    </div>
  );
}
