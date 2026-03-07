import { TopBar } from "@/components/top-bar";
import { StackPanel } from "@/components/stack-panel";
import { FeedPanel } from "@/components/feed-panel";
import { NotificationBar } from "@/components/notification-bar";

export default function Home() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-y-auto border-r border-border p-4">
          <StackPanel />
        </div>
        <div className="w-1/2 overflow-y-auto p-4">
          <FeedPanel />
        </div>
      </div>
      <NotificationBar count={0} />
    </div>
  );
}
