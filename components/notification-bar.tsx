"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotificationItem {
  id: number;
  verdict: string;
  mappedToName: string | null;
  reason: string | null;
  loggedAt: string;
}

export function NotificationBar() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => res.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => {});
  }, []);

  const count = items.length;

  if (count <= 0 || dismissed) return null;

  async function handleDismiss() {
    const ids = items.map((i) => i.id);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setDismissed(true);
  }

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between bg-accent/50 px-4 py-2">
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="size-4 text-amber-500" />
          <span>
            {count} item{count !== 1 ? "s" : ""} filtered during classification
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer h-7 text-xs"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? "Hide" : "Review"}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="cursor-pointer"
            onClick={handleDismiss}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
      {showDetails && (
        <div className="bg-accent/30 px-4 py-2 space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-start gap-2 text-xs text-muted-foreground">
              <span className="font-mono shrink-0 uppercase text-[10px] mt-0.5">
                {item.verdict}
              </span>
              <span>{item.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
