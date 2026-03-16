import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { cn } from "../lib/utils";
import {
  Activity,
  CircleCheck,
  CircleX,
  Loader2,
  Circle,
  ExternalLink,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";

interface CodespaceStatusProps {
  vaultId: Id<"vaults">;
  repositoryFullName: string;
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
const DEFAULT_STATE_STYLE = {
  icon: Activity,
  color: "text-muted-foreground",
  label: "Unknown",
} as const;

export function CodespaceStatus({
  vaultId,
  repositoryFullName,
  className,
  showActions = true,
}: CodespaceStatusProps) {
  const [isEnsuringCodespace, setIsEnsuringCodespace] = useState(false);
  const [isDeletingCodespace, setIsDeletingCodespace] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const ensureCodespaceReady = useAction(
    api.vaultCodespaceIntegration.ensureCodespaceReady,
  );
  const deleteCodespace = useAction(api.codespaces.deleteCodespace);
  const codespace = useQuery(api.codespacesMutations.getActiveCodespace, {
    vaultId,
  });

  const handleEnsureCodespace = async () => {
    if (isEnsuringCodespace) return;
    setIsEnsuringCodespace(true);
    try {
      await ensureCodespaceReady({ vaultId });
    } catch (error) {
      console.error("Failed to ensure Codespace is ready:", error);
    } finally {
      setIsEnsuringCodespace(false);
    }
  };

  const handleDeleteCodespace = async () => {
    if (!codespace || isDeletingCodespace) return;
    setIsDeletingCodespace(true);
    try {
      await deleteCodespace({ codespaceId: codespace._id });
    } catch (error) {
      console.error("Failed to delete Codespace:", error);
    } finally {
      setIsDeletingCodespace(false);
      setIsDeleteDialogOpen(false);
    }
  };

  if (!codespace) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Badge variant="outline" className="text-muted-foreground">
          No Codespace
        </Badge>
        {showActions && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void handleEnsureCodespace();
            }}
            disabled={isEnsuringCodespace}
          >
            {isEnsuringCodespace && (
              <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            )}
            Create Codespace
          </Button>
        )}
      </div>
    );
  }

  const stateStyle = STATE_STYLES[codespace.state] ?? DEFAULT_STATE_STYLE;
  const Icon = stateStyle.icon;

  const isHealthy = codespace.agentHealthy ?? false;
  const isRunning = codespace.state === "running";
  const portsEnsured = codespace.portsVisibilityEnsured;
  const portsEnsuredAt = codespace.portsVisibilityEnsuredAt;
  const portsLastError = codespace.portsVisibilityLastError;
  const agentBaseUrl =
    codespace.agentUrl ??
    `https://${codespace.ghCodespaceName}-3000.app.github.dev`;
  const agentHealthUrl = `${agentBaseUrl.replace(/\/$/, "")}/health`;
  const commitUrl = `https://github.com/${repositoryFullName}/commit/${codespace.commitSha}`;

  const portsBadge = (() => {
    if (!isRunning) {
      return null;
    }

    if (portsEnsured === true) {
      return (
        <a
          href={agentHealthUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-ui no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={(event) => {
            event.stopPropagation();
          }}
          title="Open agent /health"
        >
          <Badge variant="outline" className="text-xs text-emerald-700">
            Ports ok
          </Badge>
        </a>
      );
    }

    if (portsEnsured === false) {
      return (
        <Badge variant="outline" className="text-xs text-red-700">
          Ports issue
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Ports unknown
      </Badge>
    );
  })();

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-wrap items-center gap-2">
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
                      "h-2 w-2 rounded-ui",
                      isHealthy ? "bg-emerald-500" : "bg-red-500",
                    )}
                    title={isHealthy ? "Agent healthy" : "Agent unhealthy"}
                  />
                )}
                {portsBadge}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <p>
                  <strong>State:</strong> {codespace.state}
                </p>
                <p>
                  <strong>Name:</strong> {codespace.ghCodespaceName}
                </p>
                {isRunning && (
                  <p>
                    <strong>Agent:</strong>{" "}
                    {isHealthy ? "Healthy" : "Unhealthy"}
                  </p>
                )}
                {isRunning && (
                  <p>
                    <strong>Ports:</strong>{" "}
                    {portsEnsured === true
                      ? "OK"
                      : portsEnsured === false
                        ? "Issue"
                        : "Unknown"}
                    {portsEnsuredAt && (
                      <> ({new Date(portsEnsuredAt).toLocaleTimeString()})</>
                    )}
                  </p>
                )}
                {isRunning && portsLastError && (
                  <p className="max-w-72 break-words">
                    <strong>Ports Error:</strong> {portsLastError}
                  </p>
                )}
                <p>
                  <strong>Commit:</strong>{" "}
                  <a
                    href={commitUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono underline underline-offset-2 hover:opacity-80"
                    title="View commit on GitHub"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {codespace.commitSha.substring(0, 7)}
                  </a>
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

        {showActions && (
          <div className="flex flex-wrap items-center gap-1">
            {isRunning && codespace.webUrl && (
              <Button variant="ghost" size="sm" asChild className="h-8 gap-1">
                <a
                  href={codespace.webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  Open in Browser
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDeleteDialogOpen(true);
              }}
              disabled={isDeletingCodespace}
            >
              {isDeletingCodespace ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <TrashIcon className="h-3 w-3" />
              )}
              Remove
            </Button>
          </div>
        )}
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Codespace</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the Codespace for{" "}
              <strong>{codespace.ghCodespaceName}</strong>? This will delete the
              dev container from GitHub.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDeleteDialogOpen(false);
              }}
              disabled={isDeletingCodespace}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void handleDeleteCodespace();
              }}
              disabled={isDeletingCodespace}
            >
              Remove Codespace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
