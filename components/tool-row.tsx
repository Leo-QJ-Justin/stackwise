import Link from "next/link";
import { Badge } from "@/components/ui/badge";

const badgeColorMap: Record<string, string> = {
  skills_only: "border-blue-500/40 text-blue-400 bg-blue-500/10",
  capability: "border-amber-500/40 text-amber-400 bg-amber-500/10",
  hybrid: "border-purple-500/40 text-purple-400 bg-purple-500/10",
};

interface ToolRowProps {
  id: number;
  name: string;
  pluginType: string | null;
  description: string | null;
}

export function ToolRow({ id, name, pluginType, description }: ToolRowProps) {
  const colorClass = pluginType ? badgeColorMap[pluginType] ?? "" : "";

  return (
    <Link
      href={`/tools/${id}`}
      className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-200 hover:bg-muted"
    >
      <span className="shrink-0 font-mono text-sm">{name}</span>

      {pluginType && (
        <Badge variant="outline" className={colorClass}>
          {pluginType}
        </Badge>
      )}

      {description && (
        <span className="truncate text-xs text-muted-foreground">
          {description}
        </span>
      )}
    </Link>
  );
}
