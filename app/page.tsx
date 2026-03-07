import { TopBar } from "@/components/top-bar";
import { StackDashboard } from "@/components/stack-dashboard";
import { NotificationBar } from "@/components/notification-bar";

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <StackDashboard />
      <NotificationBar />
    </div>
  );
}
