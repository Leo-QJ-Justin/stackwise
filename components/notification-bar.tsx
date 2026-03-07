"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationBarProps {
  count: number;
}

export function NotificationBar({ count }: NotificationBarProps) {
  const [dismissed, setDismissed] = useState(false);

  if (count <= 0 || dismissed) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-t bg-accent/50 px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="size-4 text-amber-500" />
        <span>
          {count} duplicate{count !== 1 ? "s" : ""} detected during last scan
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="cursor-pointer h-7 text-xs"
          onClick={() => {}}
        >
          Review
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => setDismissed(true)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
