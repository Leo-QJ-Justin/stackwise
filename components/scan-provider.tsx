"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface ScanContextValue {
  scanning: boolean;
  scanStatus: string | null;
  unclassifiedCount: number;
  triggerScan: () => void;
  /** Register a callback that fires on scan completion events. Returns unsubscribe. */
  addScanListener: (cb: () => void) => () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within ScanProvider");
  return ctx;
}

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [unclassifiedCount, setUnclassifiedCount] = useState(0);

  const listenersRef = useRef(new Set<() => void>());
  const abortRef = useRef<AbortController | null>(null);

  const addScanListener = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => {
      listenersRef.current.delete(cb);
    };
  }, []);

  const notifyListeners = useCallback(() => {
    listenersRef.current.forEach((cb) => cb());
  }, []);

  // Fetch unclassified count whenever scanning state changes
  useEffect(() => {
    fetch("/api/scan")
      .then((res) => res.json())
      .then((data) => setUnclassifiedCount(data.unclassifiedCount ?? 0))
      .catch(() => {});
  }, [scanning]);

  // Auto-scan on first load if DB is empty
  const autoScannedRef = useRef(false);
  const triggerScanRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    triggerScanRef.current = triggerScan;
  });

  useEffect(() => {
    if (autoScannedRef.current) return;
    autoScannedRef.current = true;
    fetch("/api/stack")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length === 0) {
          triggerScanRef.current?.();
        } else {
          autoScannedRef.current = false;
        }
      })
      .catch(() => {
        autoScannedRef.current = false;
      });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const triggerScan = useCallback(async () => {
    setScanning(true);
    setScanStatus(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        signal: controller.signal,
      });
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
          const match = line.match(/^data:\s*(.+)$/);
          if (!match) continue;

          try {
            const event = JSON.parse(match[1]);
            if (event.type === "classifying") {
              setScanStatus(`Classifying ${event.name}...`);
            } else if (event.type === "classified") {
              setScanStatus(
                `Classified: ${event.name} → ${event.category ?? "done"}`,
              );
              notifyListeners();
            } else if (event.type === "fallback") {
              setScanStatus(
                `Added: ${event.name} (classification failed)`,
              );
              notifyListeners();
            } else if (event.type === "phase") {
              setScanStatus(`Reclassifying ${event.total} tools...`);
            } else if (event.type === "warning" && event.name) {
              setScanStatus(
                `Warning: ${event.name} — ${event.warning}`,
              );
            } else if (event.type === "error" && event.name) {
              setScanStatus(`Failed: ${event.name}`);
            } else if (event.type === "done") {
              setScanStatus(`Done — ${event.classified} classified`);
              notifyListeners();
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setScanStatus("Scan request failed");
    } finally {
      await new Promise((r) => setTimeout(r, 3000));
      setScanning(false);
    }
  }, [notifyListeners]);

  return (
    <ScanContext.Provider
      value={{
        scanning,
        scanStatus,
        unclassifiedCount,
        triggerScan,
        addScanListener,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}
