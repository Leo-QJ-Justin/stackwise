"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/top-bar";
import { StatsBar } from "@/components/stats-bar";
import { StackDashboard } from "@/components/stack-dashboard";
import { NotificationBar } from "@/components/notification-bar";
import { useScan } from "@/components/scan-provider";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { addScanListener } = useScan();

  useEffect(() => {
    return addScanListener(() => setRefreshKey((k) => k + 1));
  }, [addScanListener]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <StatsBar refreshKey={refreshKey} />
      <StackDashboard refreshKey={refreshKey} />
      <NotificationBar />
    </div>
  );
}
