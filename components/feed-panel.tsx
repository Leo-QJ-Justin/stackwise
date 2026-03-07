"use client";

import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { SuggestionCard } from "@/components/suggestion-card";
import type { SelectTool } from "@/lib/db/schema";

const CATEGORIES = [
  "Development",
  "Skills & File Handling",
  "Integrations",
  "Workflow & Agents",
  "Prompting & Context",
  "Research & Knowledge",
  "UI & Frontend",
  "My Skills",
] as const;

export function FeedPanel() {
  const [suggested, setSuggested] = useState<SelectTool[]>([]);
  const [evaluated, setEvaluated] = useState<SelectTool[]>([]);

  const loadFeed = useCallback(async () => {
    const [suggestedRes, evaluatedRes] = await Promise.all([
      fetch("/api/tools?status=queue"),
      fetch("/api/tools?status=evaluated_rejected"),
    ]);

    if (suggestedRes.ok) {
      setSuggested(await suggestedRes.json());
    }
    if (evaluatedRes.ok) {
      setEvaluated(await evaluatedRes.json());
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleAccept = async (id: number) => {
    await fetch("/api/stack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolId: id }),
    });
    await loadFeed();
  };

  const handleSkip = async (id: number) => {
    await fetch("/api/tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "evaluated_rejected" }),
    });
    await loadFeed();
  };

  // Group suggested tools by category
  const grouped = CATEGORIES.reduce<Record<string, SelectTool[]>>(
    (acc, cat) => {
      const items = suggested.filter((t) => t.category === cat);
      if (items.length > 0) {
        acc[cat] = items;
      }
      return acc;
    },
    {}
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Intelligence Feed
        </h2>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="suggested" className="flex-1 overflow-hidden">
        <div className="px-4 pt-3">
          <TabsList>
            <TabsTrigger value="suggested">
              Suggested ({suggested.length})
            </TabsTrigger>
            <TabsTrigger value="evaluated">
              Evaluated ({evaluated.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Suggested tab */}
        <TabsContent
          value="suggested"
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {Object.keys(grouped).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No suggestions
            </p>
          ) : (
            <Accordion>
              {Object.entries(grouped).map(([category, tools]) => (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger>
                    <span className="text-xs text-muted-foreground">
                      For: {category}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {tools.map((tool) => (
                        <SuggestionCard
                          key={tool.id}
                          id={tool.id}
                          name={tool.name}
                          category={tool.category}
                          pluginType={tool.pluginType}
                          description={tool.description}
                          onAccept={handleAccept}
                          onSkip={handleSkip}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>

        {/* Evaluated tab */}
        <TabsContent
          value="evaluated"
          className="flex-1 overflow-y-auto px-4 py-3"
        >
          {evaluated.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No evaluated tools yet
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {evaluated.map((tool) => (
                <div
                  key={tool.id}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="font-mono">{tool.name}</span>
                  {tool.verdictReason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tool.verdictReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
