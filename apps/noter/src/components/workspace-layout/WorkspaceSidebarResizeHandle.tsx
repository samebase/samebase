import * as React from "react";
import { ResizeGripLines } from "@/components/ResizeGripLines";
import type { SidebarSide } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

const POINTER_RESIZE_CURSOR = "col-resize";
const KEYBOARD_RESIZE_TIMEOUT_MS = 120;

function clampWidthPx(widthPx: number, minWidthPx: number, maxWidthPx: number) {
  return Math.max(minWidthPx, Math.min(widthPx, maxWidthPx));
}

function getKeyboardResizeDeltaPx(
  event: React.KeyboardEvent<HTMLDivElement>,
  side: SidebarSide,
) {
  const stepPx = event.shiftKey ? 96 : 24;

  if (side === "left") {
    if (event.key === "ArrowRight") {
      return stepPx;
    }
    if (event.key === "ArrowLeft") {
      return -stepPx;
    }
    return 0;
  }

  if (event.key === "ArrowLeft") {
    return stepPx;
  }
  if (event.key === "ArrowRight") {
    return -stepPx;
  }
  return 0;
}

type WorkspaceSidebarResizeHandleProps = {
  currentWidthPx: number;
  dataTestId: string;
  maxWidthPx: number;
  minWidthPx: number;
  onBlur?: () => void;
  onFocus?: () => void;
  onResizeEnd?: () => void;
  onResizeStart?: () => void;
  onWidthChange: (widthPx: number) => void;
  positionPx: number;
  side: SidebarSide;
};

/**
 * Mirror the chat dock's separator interaction so workspace panes resize with
 * one shared pointer + keyboard affordance everywhere.
 */
export function WorkspaceSidebarResizeHandle({
  currentWidthPx,
  dataTestId,
  maxWidthPx,
  minWidthPx,
  onBlur,
  onFocus,
  onResizeEnd,
  onResizeStart,
  onWidthChange,
  positionPx,
  side,
}: WorkspaceSidebarResizeHandleProps) {
  const dragStateRef = React.useRef<{
    startClientX: number;
    startWidthPx: number;
  } | null>(null);
  const keyboardResizeTimeoutRef = React.useRef<number | null>(null);
  const [isResizing, setIsResizing] = React.useState(false);

  React.useEffect(() => {
    if (!isResizing || dragStateRef.current === null) {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      return;
    }

    document.body.style.setProperty("cursor", POINTER_RESIZE_CURSOR);
    document.body.style.setProperty("user-select", "none");
    return () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [isResizing]);

  React.useEffect(() => {
    return () => {
      if (keyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(keyboardResizeTimeoutRef.current);
      }
    };
  }, []);

  const commitWidthChange = React.useCallback(
    (nextWidthPx: number) => {
      onWidthChange(clampWidthPx(nextWidthPx, minWidthPx, maxWidthPx));
    },
    [maxWidthPx, minWidthPx, onWidthChange],
  );

  const stopResizing = React.useCallback(() => {
    dragStateRef.current = null;
    setIsResizing(false);
    onResizeEnd?.();
  }, [onResizeEnd]);

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      dragStateRef.current = {
        startClientX: event.clientX,
        startWidthPx: currentWidthPx,
      };
      setIsResizing(true);
      onResizeStart?.();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [currentWidthPx, onResizeStart],
  );

  const handlePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState === null) {
        return;
      }

      const pointerDeltaPx =
        (event.clientX - dragState.startClientX) * (side === "left" ? 1 : -1);
      commitWidthChange(dragState.startWidthPx + pointerDeltaPx);
    },
    [commitWidthChange, side],
  );

  const handlePointerEnd = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      stopResizing();
    },
    [stopResizing],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const deltaPx = getKeyboardResizeDeltaPx(event, side);
      if (deltaPx === 0) {
        return;
      }

      event.preventDefault();
      setIsResizing(true);
      onResizeStart?.();
      commitWidthChange(currentWidthPx + deltaPx);
      if (keyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(keyboardResizeTimeoutRef.current);
      }
      keyboardResizeTimeoutRef.current = window.setTimeout(() => {
        setIsResizing(false);
        keyboardResizeTimeoutRef.current = null;
        onResizeEnd?.();
      }, KEYBOARD_RESIZE_TIMEOUT_MS);
    },
    [commitWidthChange, currentWidthPx, onResizeEnd, onResizeStart, side],
  );

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${side} sidebar`}
      aria-orientation="vertical"
      aria-valuemin={minWidthPx}
      aria-valuemax={maxWidthPx}
      aria-valuenow={Math.round(currentWidthPx)}
      aria-valuetext={`${Math.round(currentWidthPx)} pixels wide`}
      data-sidebar-resize-handle={side}
      data-testid={dataTestId}
      className={cn(
        "absolute inset-y-0 z-20 flex w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isResizing && "bg-accent/50",
      )}
      style={{ left: `${positionPx}px` }}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={stopResizing}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <div
        className={cn(
          "flex h-16 w-3 items-center justify-center bg-background/80 text-foreground/70 transition-colors hover:bg-accent hover:text-foreground",
          isResizing && "bg-accent text-foreground",
        )}
      >
        <ResizeGripLines className="rotate-90" />
      </div>
    </div>
  );
}
