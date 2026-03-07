"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ToolRow } from "@/components/tool-row";

interface ToolData {
  id: number;
  name: string;
  category: string;
  pluginType: string | null;
  description: string | null;
}

interface StackItem {
  id: number;
  toolId: number;
  notes: string | null;
  addedAt: string;
  tool: ToolData;
}

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

const FILTER_TABS = ["all", "skills_only", "capability", "hybrid"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const filterLabels: Record<FilterTab, string> = {
  all: "All",
  skills_only: "Skills",
  capability: "Capability",
  hybrid: "Hybrid",
};

export function StackPanel() {
  const [items, setItems] = useState<StackItem[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");

  useEffect(() => {
    fetch("/api/stack")
      .then((res) => res.json())
      .then((data: StackItem[]) => setItems(data))
      .catch(() => {});
  }, []);

  const filtered =
    filter === "all"
      ? items
      : items.filter((item) => item.tool.pluginType === filter);

  const grouped = CATEGORIES.reduce<Record<string, StackItem[]>>(
    (acc, cat) => {
      const matching = filtered.filter((item) => item.tool.category === cat);
      if (matching.length > 0) {
        acc[cat] = matching;
      }
      return acc;
    },
    {}
  );

  const categoryKeys = Object.keys(grouped);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-mono text-sm font-semibold tracking-tight">
        My Stack
      </h2>

      <Tabs defaultValue="all" onValueChange={(val: any) => setFilter(val as FilterTab)}>
        <TabsList>
          {FILTER_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {filterLabels[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Single content area shared across all tab values */}
        {FILTER_TABS.map((tab) => (
          <TabsContent key={tab} value={tab}>
            {categoryKeys.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No tools found.
              </p>
            ) : (
              <Accordion multiple defaultValue={categoryKeys}>
                {categoryKeys.map((cat) => (
                  <AccordionItem key={cat} value={cat}>
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-widest">
                          {cat}
                        </span>
                        <Badge variant="secondary">{grouped[cat].length}</Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-0.5">
                        {grouped[cat].map((item) => (
                          <ToolRow
                            key={item.tool.id}
                            id={item.tool.id}
                            name={item.tool.name}
                            pluginType={item.tool.pluginType}
                            description={item.tool.description}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
