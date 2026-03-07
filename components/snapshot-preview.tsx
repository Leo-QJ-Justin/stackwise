"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";

interface SnapshotPreviewProps {
  markdown: string;
}

export function SnapshotPreview({ markdown }: SnapshotPreviewProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "claude-stack.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          <Copy className="size-4" />
          {copied ? "Copied!" : "Copy to Clipboard"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="size-4" />
          Download .md
        </Button>
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-md border bg-card p-4 font-mono text-xs">
        {markdown}
      </pre>
    </div>
  );
}
