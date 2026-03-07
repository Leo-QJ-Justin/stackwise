"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <div className="flex items-center gap-4">
        <h1 className="font-mono text-base font-bold tracking-tight text-primary">
          StackWise
        </h1>
        {lastScanned && (
          <span className="font-mono text-[11px] text-muted-foreground">
            scanned {lastScanned}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
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
