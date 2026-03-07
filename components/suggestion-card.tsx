"use client";

import { Plus, X } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SuggestionCardProps {
  id: number;
  name: string;
  category: string;
  pluginType: string | null;
  description: string | null;
  onAccept: (id: number) => void;
  onSkip: (id: number) => void;
}

export function SuggestionCard({
  id,
  name,
  category,
  pluginType,
  description,
  onAccept,
  onSkip,
}: SuggestionCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{name}</span>
          {pluginType && (
            <Badge variant="secondary">{pluginType}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {description && (
          <p className="mb-3 text-xs text-muted-foreground">{description}</p>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="default"
            className="cursor-pointer h-7 text-xs"
            onClick={() => onAccept(id)}
          >
            <Plus className="size-3" />
            Add
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer h-7 text-xs"
            onClick={() => onSkip(id)}
          >
            <X className="size-3" />
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
