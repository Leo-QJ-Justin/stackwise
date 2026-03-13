"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { RefreshCw, Download, Settings, History, Sparkles } from "lucide-react";
import { SearchModal } from "@/components/search-modal";
import { useScan } from "@/components/scan-provider";

export function TopBar() {
  const { scanning, scanStatus, unclassifiedCount, triggerScan } = useScan();

  return (
    <>
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="font-mono text-base font-bold tracking-tight text-primary">
            <Link href="/" className="hover:opacity-80 transition-opacity">StackWise</Link>
          </h1>
          <Link
            href="/skills"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Sparkles className="size-3.5" />
            Skills Lab
          </Link>
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
            onClick={triggerScan}
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
