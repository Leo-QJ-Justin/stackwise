"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { RefreshCw, Download, Settings, History } from "lucide-react";
import { SearchModal } from "@/components/search-modal";

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

  // Auto-scan on first load if DB is empty (ref prevents React strict mode double-fire)
  const autoScannedRef = useRef(false);
  useEffect(() => {
    if (autoScannedRef.current || scanning) return;
    autoScannedRef.current = true;
    fetch("/api/stack")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length === 0) {
          handleScan();
        } else {
          autoScannedRef.current = false;
        }
      })
      .catch(() => { autoScannedRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              setScanStatus(`Classified: ${event.name} → ${event.category ?? "done"}`);
              onScanComplete?.();
            } else if (event.type === "fallback") {
              setScanStatus(`Added: ${event.name} (classification failed)`);
              onScanComplete?.();
            } else if (event.type === "phase") {
              setScanStatus(`Reclassifying ${event.total} tools...`);
            } else if (event.type === "warning" && event.name) {
              setScanStatus(`Warning: ${event.name} — ${event.warning}`);
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
      // Keep banner visible briefly so user sees the final status
      await new Promise((r) => setTimeout(r, 3000));
      setScanning(false);
    }
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-base font-bold tracking-tight text-primary">
            StackWise
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <SearchModal />
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
            href="/history"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <History className="size-3.5" />
            History
          </Link>

          <Link
            href="/settings"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <Settings className="size-3.5" />
          </Link>
        </div>
      </header>

      {scanning && (
        <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-6 py-2">
          <RefreshCw className="size-3.5 animate-spin text-primary" />
          <span className="font-mono text-sm text-foreground">
            {scanStatus ?? "Starting scan..."}
          </span>
        </div>
      )}
    </>
  );
}
