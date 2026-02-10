import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";
import { Activity, CircleCheck, CircleX, Loader2, Circle, ExternalLink } from "lucide-react";

interface CodespaceStatusProps {
  vaultId: Id<"vaults">;
  className?: string;
  showActions?: boolean;
}

const STATE_STYLES: Record<
  string,
  { icon: typeof Activity; color: string; label: string }
> = {
  creating: {
    icon: Loader2,
    color: "text-blue-600 animate-spin",
    label: "Creating",
  },
  starting: {
    icon: Loader2,
    color: "text-blue-600 animate-spin",
    label: "Starting",
  },
  running: {
    icon: CircleCheck,
    color: "text-emerald-600",
    label: "Running",
  },
  stopping: {
    icon: Loader2,
    color: "text-amber-600 animate-spin",
    label: "Stopping",
  },
  stopped: {
    icon: Circle,
    color: "text-muted-foreground",
    label: "Stopped",
  },
  deleting: {
    icon: Loader2,
    color: "text-red-600 animate-spin",
    label: "Deleting",
  },
  deleted: {
    icon: CircleX,
    color: "text-red-600",
    label: "Deleted",
  },
  failed: {
    icon: CircleX,
    color: "text-red-600",
    label: "Failed",
  },
};

export function CodespaceStatus({
  vaultId,
  className,
  showActions = true,
}: CodespaceStatusProps) {
  const codespace = useQuery(api.codespacesMutations.getActiveCodespace, { vaultId });

  if (!codespace) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge variant="outline" className="text-muted-foreground">
          No Codespace
        </Badge>
      </div>
    );
  }

  const stateStyle = STATE_STYLES[codespace.state] || STATE_STYLES.stopped;
  const Icon = stateStyle.icon;

  const isHealthy = codespace.agentHealthy ?? false;
  const isRunning = codespace.state === "running";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", stateStyle.color)} />
              <Badge
                variant={isRunning ? "default" : "outline"}
                className={cn(!isRunning && "text-muted-foreground")}
              >
                {stateStyle.label}
              </Badge>
              {isRunning && (
                <div
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isHealthy ? "bg-emerald-500" : "bg-red-500"
                  )}
                  title={isHealthy ? "Agent healthy" : "Agent unhealthy"}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p>
                <strong>State:</strong> {codespace.state}
              </p>
              {isRunning && (
                <p>
                  <strong>Agent:</strong> {isHealthy ? "Healthy" : "Unhealthy"}
                </p>
              )}
              <p>
                <strong>Commit:</strong> {codespace.commitSha.substring(0, 7)}
              </p>
              {codespace.lastHealthCheckAt && (
                <p>
                  <strong>Last Check:</strong>{" "}
                  {new Date(codespace.lastHealthCheckAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {showActions && isRunning && codespace.webUrl && (
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="h-8 gap-1"
        >
          <a
            href={codespace.webUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Browser
            <ExternalLink className="h-3 w-3" />
          </a>
        </Button>
      )}
    </div>
  );
}
