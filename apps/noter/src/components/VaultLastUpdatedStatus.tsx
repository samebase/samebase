import { useEffect, useRef, useState } from "react";
import { formatRelativeTimeAgoWithSeconds } from "@/lib/formatRelativeTime";

const hasActiveTextSelection = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
};

const getCurrentSecondTimestamp = () => Math.floor(Date.now() / 1000) * 1000;

/**
 * Keeps the ticking relative-time label stable while the user is selecting it,
 * and triggers a guarded refresh action on a plain click.
 */
export function VaultLastUpdatedStatus({
  lastSyncedAt,
  now,
  onRefresh,
  repositoryFullName,
}: {
  lastSyncedAt: number;
  now: number;
  onRefresh: () => void;
  repositoryFullName: string;
}) {
  const [frozenNow, setFrozenNow] = useState<number | null>(null);
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (hasActiveTextSelection()) {
        setFrozenNow((current) => current ?? getCurrentSecondTimestamp());
        return;
      }

      if (!isPointerDownRef.current) {
        setFrozenNow(null);
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
      if (!hasActiveTextSelection()) {
        setFrozenNow(null);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  return (
    <button
      type="button"
      className="inline-flex cursor-pointer select-text items-center gap-1 bg-transparent p-0 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      title={`Last synced ${new Date(lastSyncedAt).toLocaleString()}. Click to refresh now.`}
      aria-label={`Refresh ${repositoryFullName} now`}
      onPointerDown={() => {
        isPointerDownRef.current = true;
        setFrozenNow((current) => current ?? getCurrentSecondTimestamp());
      }}
      onClick={(event) => {
        if (hasActiveTextSelection()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        onRefresh();
      }}
    >
      <span>Updated</span>
      <span className="min-w-[8ch] text-left font-mono tabular-nums">
        {formatRelativeTimeAgoWithSeconds(lastSyncedAt, frozenNow ?? now)}
      </span>
    </button>
  );
}
