"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download, Settings } from "lucide-react";

export function TopBar() {
  const [scanning, setScanning] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  async function handleScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setLastScanned(new Date().toLocaleTimeString());
        alert(data.message ?? "Scan complete.");
      } else {
        alert(data.error ?? "Scan failed.");
      }
    } catch {
      alert("Scan request failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="flex items-center justify-between border-b px-4 py-2">
      <div className="flex items-center gap-4">
        <h1 className="font-mono text-lg font-semibold tracking-tight">
          StackWise
        </h1>
        {lastScanned && (
          <span className="text-xs text-muted-foreground">
            Last scanned: {lastScanned}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={handleScan}
          disabled={scanning}
        >
          <RefreshCw
            className={scanning ? "animate-spin" : ""}
          />
          Scan Now
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="cursor-pointer"
          render={<a href="/export" />}
        >
          <Download />
          Export
        </Button>

        <Button variant="ghost" size="icon" className="cursor-pointer">
          <Settings />
        </Button>
      </div>
    </div>
  );
}
