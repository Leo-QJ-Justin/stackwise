"use client";

import { useState } from "react";
import { TopBar } from "@/components/top-bar";
import { StackDashboard } from "@/components/stack-dashboard";
import { NotificationBar } from "@/components/notification-bar";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar onScanComplete={() => setRefreshKey((k) => k + 1)} />
      <StackDashboard refreshKey={refreshKey} />
      <NotificationBar />
    </div>
  );
}
