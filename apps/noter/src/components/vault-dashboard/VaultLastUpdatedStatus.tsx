import { useCreateStore, useSelector } from "@tanstack/react-store";
import { useEffect, useRef } from "react";
import { formatRelativeTimeAgoWithSeconds } from "#src/lib/formatRelativeTime.ts";

const hasActiveTextSelection = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed;
};

const getCurrentSecondTimestamp = () => Math.floor(Date.now() / 1000) * 1000;

type VaultLastUpdatedStatusState = {
  frozenNow: number | null;
};

const VAULT_LAST_UPDATED_STATUS_INITIAL_STATE: VaultLastUpdatedStatusState = {
  frozenNow: null,
};

function useVaultLastUpdatedStatusStore() {
  return useCreateStore(
    VAULT_LAST_UPDATED_STATUS_INITIAL_STATE,
    ({ setState }) => ({
      clearFrozenNow: () => {
        setState((state) =>
          state.frozenNow === null ? state : { ...state, frozenNow: null },
        );
      },
      freezeNow: () => {
        setState((state) =>
          state.frozenNow === null
            ? { ...state, frozenNow: getCurrentSecondTimestamp() }
            : state,
        );
      },
    }),
  );
}

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
  const statusStore = useVaultLastUpdatedStatusStore();
  const frozenNow = useSelector(statusStore, (state) => state.frozenNow);
  const { clearFrozenNow, freezeNow } = statusStore.actions;
  const isPointerDownRef = useRef(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      if (hasActiveTextSelection()) {
        freezeNow();
        return;
      }

      if (!isPointerDownRef.current) {
        clearFrozenNow();
      }
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
      if (!hasActiveTextSelection()) {
        clearFrozenNow();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clearFrozenNow, freezeNow]);

  return (
    <button
      type="button"
      className="inline-flex cursor-pointer select-text items-center gap-1 bg-transparent p-0 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
      title={`Last synced ${new Date(lastSyncedAt).toLocaleString()}. Click to refresh now.`}
      aria-label={`Refresh ${repositoryFullName} now`}
      onPointerDown={() => {
        isPointerDownRef.current = true;
        freezeNow();
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
