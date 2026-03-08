"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { RefreshCw, Download, Settings } from "lucide-react";

interface TopBarProps {
  onScanComplete?: () => void;
}

export function TopBar({ onScanComplete }: TopBarProps) {
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  useEffect(() => {
    fetch("/api/scan")
      .then((res) => res.json())
      .then((data) => setUnclassifiedCount(data.unclassifiedCount ?? 0))
      .catch(() => {});
  }, [scanning]);

  async function handleScan() {
    setScanning(true);
    setScanStatus(null);

    try {
      const res = await fetch("/api/scan", { method: "POST" });
      if (!res.body) {
        setScanStatus("No response");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const match = line.match(/^data: (.+)$/);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]);
            if (event.type === "classifying") {
              setScanStatus(`Classifying ${event.name}...`);
            } else if (event.type === "classified") {
              setScanStatus(`${event.name} → ${event.category ?? "done"}`);
              onScanComplete?.();
            } else if (event.type === "phase") {
              setScanStatus(`Reclassifying ${event.total} tools...`);
            } else if (event.type === "error" && event.name) {
              setScanStatus(`Failed: ${event.name}`);
            } else if (event.type === "done") {
              setScanStatus(`Done — ${event.classified} classified`);
              onScanComplete?.();
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      setScanStatus("Scan request failed");
    } finally {
      setScanning(false);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="font-mono text-base font-bold tracking-tight text-primary">
          StackWise
        </h1>
        {scanStatus && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {scanStatus}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {!scanning && unclassifiedCount > 0 && (
          <span className="font-mono text-[11px] text-amber-500">
            {unclassifiedCount} tool{unclassifiedCount !== 1 ? "s" : ""} need classification
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer gap-1.5"
          onClick={handleScan}
          disabled={scanning}
        >
          <RefreshCw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} />
          Scan
        </Button>

        <Link
          href="/export"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Download className="size-3.5" />
          Export
        </Link>

        <Link
          href="/settings"
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
        >
          <Settings className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}
