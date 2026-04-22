import { ChevronDownIcon } from "@/lib/radixIcons";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatRelativeTimeAgo,
  formatRelativeTimeUntil,
} from "@/lib/formatRelativeTime";
import { shortenCommitSha } from "@/lib/daytonaSnapshot";
import { cn } from "@/lib/utils";

const SNAPSHOT_POLL_INTERVAL_MS = 5_000;

type ListSnapshotsResult = FunctionReturnType<
  typeof api.daytona.actions.listDaytonaSnapshotsForVault
>;
type SnapshotRow = ListSnapshotsResult["snapshots"][number];

interface DaytonaSnapshotListProps {
  vaultId: Id<"vaults">;
  disabled?: boolean;
  className?: string;
}

const formatSnapshotState = (state: string) => {
  const normalized = state.trim().toLowerCase();
  if (normalized === "build_failed") return "Build failed";
  if (normalized === "active") return "Active";
  if (normalized === "queued") return "Queued";
  if (normalized === "building") return "Building";
  if (normalized === "pending") return "Pending";
  if (normalized === "pulling") return "Pulling";
  if (normalized === "inactive") return "Inactive";
  if (normalized === "error") return "Error";
  if (normalized === "removing") return "Removing";
  return state;
};

const getSnapshotStateClassName = (state: string) => {
  const normalized = state.trim().toLowerCase();
  if (normalized === "active") return "text-emerald-700 border-emerald-300";
  if (
    normalized === "queued" ||
    normalized === "building" ||
    normalized === "pending"
  ) {
    return "text-blue-700 border-blue-300";
  }
  if (normalized === "pulling" || normalized === "removing") {
    return "text-amber-700 border-amber-300";
  }
  if (normalized === "error" || normalized === "build_failed") {
    return "text-destructive border-destructive/40";
  }
  return "text-muted-foreground";
};

const formatRetryTime = (timestamp: number, now: number = Date.now()) =>
  timestamp > now
    ? formatRelativeTimeUntil(timestamp, now)
    : formatRelativeTimeAgo(timestamp, now);

export function DaytonaSnapshotList({
  vaultId,
  disabled,
  className,
}: DaytonaSnapshotListProps) {
  const listDaytonaSnapshotsForVault = useAction(
    api.daytona.actions.listDaytonaSnapshotsForVault,
  );
  const removeDaytonaSnapshot = useAction(
    api.daytona.actions.removeDaytonaSnapshot,
  );
  const fetchInFlightRef = useRef(false);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotRow[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingSnapshotName, setDeletingSnapshotName] = useState<
    string | null
  >(null);

  const fetchSnapshots = useCallback(
    async (silent: boolean) => {
      if (fetchInFlightRef.current) {
        return;
      }
      fetchInFlightRef.current = true;
      if (!silent) {
        setIsFetching(true);
        setErrorMessage(null);
      }

      try {
        const result = await listDaytonaSnapshotsForVault({ vaultId });
        if (!result.ok) {
          if (!silent) {
            setErrorMessage(result.message ?? "Failed to fetch snapshots.");
          }
          return;
        }
        setSnapshots(result.snapshots);
      } catch (error) {
        if (!silent) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to fetch snapshots.",
          );
        }
      } finally {
        fetchInFlightRef.current = false;
        if (!silent) {
          setIsFetching(false);
        }
      }
    },
    [listDaytonaSnapshotsForVault, vaultId],
  );

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    void fetchSnapshots(false);
    const pollId = window.setInterval(() => {
      void fetchSnapshots(true);
    }, SNAPSHOT_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(pollId);
    };
  }, [fetchSnapshots, isExpanded]);

  const handleDeleteSnapshot = async (snapshotName: string) => {
    if (disabled || deletingSnapshotName) {
      return;
    }
    setDeletingSnapshotName(snapshotName);
    setErrorMessage(null);

    try {
      const result = await removeDaytonaSnapshot({
        vaultId,
        snapshotName,
      });
      if (!result.ok) {
        setErrorMessage(result.message ?? "Failed to delete snapshot.");
        return;
      }

      setSnapshots((current) =>
        current === null
          ? current
          : current.filter((snapshot) => snapshot.name !== snapshotName),
      );
      void fetchSnapshots(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to delete snapshot.",
      );
    } finally {
      setDeletingSnapshotName(null);
    }
  };
  const snapshotCountLabel = snapshots === null ? "?" : `${snapshots.length}`;

  return (
    <div className={cn("mt-1 flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={disabled}
          onClick={() => {
            setIsExpanded((current) => !current);
          }}
        >
          <ChevronDownIcon
            className={cn(
              "mr-1 h-3.5 w-3.5 transition-transform",
              isExpanded && "rotate-180",
            )}
          />
          {`Snapshots (${snapshotCountLabel})`}
        </Button>
        {isExpanded && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              void fetchSnapshots(false);
            }}
            disabled={disabled || isFetching}
          >
            {isFetching ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Refreshing...
              </>
            ) : (
              "Refresh"
            )}
          </Button>
        )}
      </div>

      {isExpanded && snapshots !== null && snapshots.length > 0 && (
        <div className="space-y-1 corner-notch-1 border bg-muted/5 p-2">
          {snapshots.map((snapshot) => {
            const updatedAt = snapshot.updatedAt ?? snapshot.createdAt;
            const isDeleting = deletingSnapshotName === snapshot.name;
            return (
              <div
                key={snapshot.name}
                className="corner-notch-1 border bg-background p-2"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[10px] uppercase",
                      getSnapshotStateClassName(snapshot.state),
                    )}
                  >
                    {formatSnapshotState(snapshot.state)}
                  </Badge>
                  {snapshot.dashboardUrl ? (
                    <a
                      href={snapshot.dashboardUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate font-mono text-xs underline-offset-2 hover:underline"
                      title="Open snapshot in Daytona"
                    >
                      {snapshot.name}
                    </a>
                  ) : (
                    <div className="min-w-0 flex-1 truncate font-mono text-xs">
                      {snapshot.name}
                    </div>
                  )}
                  {updatedAt !== undefined && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatRelativeTimeAgo(updatedAt)}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={disabled || deletingSnapshotName !== null}
                    onClick={() => {
                      void handleDeleteSnapshot(snapshot.name);
                    }}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete"
                    )}
                  </Button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {snapshot.commitSha ? (
                    <span className="font-mono">
                      {shortenCommitSha(snapshot.commitSha)}
                    </span>
                  ) : null}
                  <span>{snapshot.attemptCount} attempt(s)</span>
                  {snapshot.nextRetryAt ? (
                    <span>retry {formatRetryTime(snapshot.nextRetryAt)}</span>
                  ) : null}
                </div>
                {snapshot.errorReason && (
                  <div className="mt-1 text-[11px] text-destructive">
                    {snapshot.errorReason}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isExpanded && errorMessage && (
        <div className="text-xs text-destructive">{errorMessage}</div>
      )}
    </div>
  );
}
