import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ResizeGripLines } from "@/components/ResizeGripLines";
import { cn } from "@/lib/utils";

const KEYBOARD_RESIZE_TIMEOUT_MS = 120;
const POINTER_RESIZE_CURSOR = "col-resize";

function clampWidthPx(widthPx: number, minWidthPx: number, maxWidthPx: number) {
  return Math.max(minWidthPx, Math.min(widthPx, maxWidthPx));
}

function getKeyboardResizeDeltaPx(
  event: KeyboardEvent<HTMLDivElement>,
  side: "left" | "right",
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

type WorkspaceLayoutV2ResizeHandleProps = {
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
  side: "left" | "right";
};

/**
 * Keep the resize affordance identical on desktop and mobile so the shell has
 * one consistent edge-grab behavior across all panes.
 */
export function WorkspaceLayoutV2ResizeHandle({
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
}: WorkspaceLayoutV2ResizeHandleProps) {
  const dragStateRef = useRef<{
    startClientX: number;
    startWidthPx: number;
  } | null>(null);
  const keyboardResizeTimeoutRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    // The handle visually lives in the shell, but the cursor and selection lock
    // need to apply to the whole page while dragging.
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

  useEffect(() => {
    return () => {
      if (keyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(keyboardResizeTimeoutRef.current);
      }
    };
  }, []);

  const commitWidthChange = useCallback(
    (nextWidthPx: number) => {
      onWidthChange(clampWidthPx(nextWidthPx, minWidthPx, maxWidthPx));
    },
    [maxWidthPx, minWidthPx, onWidthChange],
  );

  const stopResizing = useCallback(() => {
    dragStateRef.current = null;
    setIsResizing(false);
    onResizeEnd?.();
  }, [onResizeEnd]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
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

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState === null) {
        return;
      }

      event.stopPropagation();
      const pointerDeltaPx =
        (event.clientX - dragState.startClientX) * (side === "left" ? 1 : -1);
      commitWidthChange(dragState.startWidthPx + pointerDeltaPx);
    },
    [commitWidthChange, side],
  );

  const handlePointerEnd = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        // Releasing pointer capture triggers lostpointercapture next, which is
        // where we finalize once for both pointerup and pointercancel paths.
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      stopResizing();
    },
    [stopResizing],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const deltaPx = getKeyboardResizeDeltaPx(event, side);
      if (deltaPx === 0) {
        return;
      }

      event.preventDefault();
      // Treat a burst of key presses as one resize session so the shell can hide
      // swipe affordances until keyboard resizing has actually settled.
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
      data-testid={dataTestId}
      data-workspace-layout-v2-resize-handle={side}
      className={cn(
        "absolute inset-y-0 z-30 flex w-4 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        isResizing ? "bg-accent/50" : null,
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
          isResizing ? "bg-accent text-foreground" : null,
        )}
      >
        <ResizeGripLines className="rotate-90" />
      </div>
    </div>
  );
}
