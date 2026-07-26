import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { clampNumber } from "@/lib/clampNumber";
import { cn } from "@/lib/utils";

const KEYBOARD_RESIZE_TIMEOUT_MS = 120;

function getKeyboardResizeDeltaPx(
  event: KeyboardEvent<HTMLDivElement>,
  resizeFrom: "left" | "right",
) {
  const stepPx = event.shiftKey ? 96 : 24;

  if (resizeFrom === "left") {
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

function getPointerDeltaPx(args: {
  event: PointerEvent<HTMLDivElement>;
  resizeFrom: "left" | "right";
  startClientPx: number;
}) {
  return (args.event.clientX - args.startClientPx) * (args.resizeFrom === "left" ? 1 : -1);
}

function getResizeHandleLabel(resizeFrom: "left" | "right", ariaLabel?: string) {
  if (ariaLabel !== undefined) {
    return ariaLabel;
  }

  return `Resize ${resizeFrom} sidebar`;
}

function getResizeHandleValueText(currentSizePx: number) {
  return `${Math.round(currentSizePx)} pixels wide`;
}

type WorkspaceLayoutV3ResizeHandleProps = {
  ariaLabel?: string;
  currentSizePx: number;
  dataTestId: string;
  maxSizePx: number;
  minSizePx: number;
  onBlur?: () => void;
  onFocus?: () => void;
  onResizeEnd?: () => void;
  onResizeStart?: () => void;
  onRawSizeChange?: (rawSizePx: number) => void;
  onSizeChange: (sizePx: number) => void;
  pointerTarget?: "edge" | "grip";
  positionPx: number;
  resizeFrom: "left" | "right";
};

/**
 * Keep one shared resize affordance implementation across desktop and mobile
 * while allowing each edge to decide whether desktop uses an invisible boundary
 * hit area or mobile uses a visible grip.
 */
export function WorkspaceLayoutV3ResizeHandle({
  ariaLabel,
  currentSizePx,
  dataTestId,
  maxSizePx,
  minSizePx,
  onBlur,
  onFocus,
  onResizeEnd,
  onResizeStart,
  onRawSizeChange,
  onSizeChange,
  pointerTarget = "edge",
  positionPx,
  resizeFrom,
}: WorkspaceLayoutV3ResizeHandleProps) {
  const dragStateRef = useRef<{
    startClientPx: number;
    startSizePx: number;
  } | null>(null);
  const keyboardResizeTimeoutRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  /**
   * Applies page-level cursor and selection locks only while a pointer resize is
   * active, because the handle is small but the drag feedback belongs to the
   * whole document.
   */
  useEffect(() => {
    if (!isResizing || dragStateRef.current === null) {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      return;
    }

    document.body.style.setProperty("cursor", "col-resize");
    document.body.style.setProperty("user-select", "none");
    return () => {
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [isResizing]);

  /**
   * Clears the deferred keyboard-resize end callback on unmount so a removed
   * handle cannot finish an old keyboard session against stale shell state.
   */
  useEffect(() => {
    return () => {
      if (keyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(keyboardResizeTimeoutRef.current);
      }
    };
  }, []);

  const commitSizeChange = useCallback(
    (nextSizePx: number) => {
      onSizeChange(clampNumber(nextSizePx, minSizePx, maxSizePx));
      onRawSizeChange?.(nextSizePx);
    },
    [maxSizePx, minSizePx, onRawSizeChange, onSizeChange],
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
        startClientPx: event.clientX,
        startSizePx: currentSizePx,
      };
      setIsResizing(true);
      onResizeStart?.();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [currentSizePx, onResizeStart],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (dragState === null) {
        return;
      }

      event.stopPropagation();
      const pointerDeltaPx = getPointerDeltaPx({
        event,
        resizeFrom,
        startClientPx: dragState.startClientPx,
      });
      commitSizeChange(dragState.startSizePx + pointerDeltaPx);
    },
    [commitSizeChange, resizeFrom],
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
      const deltaPx = getKeyboardResizeDeltaPx(event, resizeFrom);
      if (deltaPx === 0) {
        return;
      }

      event.preventDefault();
      // Treat a burst of key presses as one resize session so the shell can hide
      // swipe affordances until keyboard resizing has actually settled.
      setIsResizing(true);
      onResizeStart?.();
      commitSizeChange(currentSizePx + deltaPx);
      if (keyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(keyboardResizeTimeoutRef.current);
      }
      keyboardResizeTimeoutRef.current = window.setTimeout(() => {
        setIsResizing(false);
        keyboardResizeTimeoutRef.current = null;
        onResizeEnd?.();
      }, KEYBOARD_RESIZE_TIMEOUT_MS);
    },
    [commitSizeChange, currentSizePx, onResizeEnd, onResizeStart, resizeFrom],
  );

  const handlePositionStyle = { left: `${positionPx}px` };
  const gripTrackClassName = "inset-y-0 w-8 -translate-x-1/2";
  const gripSizeClassName = "h-16 w-8";
  // Keep the touch target centered on the edge; only the visible dot column
  // moves onto the adjacent pane side.
  const gripDotsClassName = resizeFrom === "left" ? "translate-x-0.5" : "-translate-x-0.5";

  const interactiveProps = {
    "aria-label": getResizeHandleLabel(resizeFrom, ariaLabel),
    "aria-orientation": "vertical" as const,
    "aria-valuemax": maxSizePx,
    "aria-valuemin": minSizePx,
    "aria-valuenow": Math.round(currentSizePx),
    "aria-valuetext": getResizeHandleValueText(currentSizePx),
    "data-testid": dataTestId,
    "data-workspace-layout-v3-resize-handle": resizeFrom,
    onBlur,
    onFocus,
    onKeyDown: handleKeyDown,
    onLostPointerCapture: stopResizing,
    onPointerCancel: handlePointerEnd,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    role: "separator" as const,
    tabIndex: 0,
  };

  if (pointerTarget === "grip") {
    return (
      <div
        className={cn(
          "pointer-events-none absolute z-30 flex items-center justify-center",
          gripTrackClassName,
        )}
        style={handlePositionStyle}
      >
        <div
          {...interactiveProps}
          className={cn(
            "pointer-events-auto relative flex touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "cursor-col-resize",
            gripSizeClassName,
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center",
              // Keep the idle mobile grip visually light so it does not mask
              // pane content sitting directly under the edge affordance.
              isResizing && "border border-border bg-background",
              gripSizeClassName,
            )}
          >
            <div
              aria-hidden="true"
              data-workspace-layout-v3-resize-grip-dots
              className={cn(
                "relative z-10 flex flex-col items-center gap-1 text-foreground/70",
                gripDotsClassName,
              )}
            >
              {Array.from({ length: 3 }, (_, index) => (
                <span key={index} className="h-[3px] w-[3px] rounded-full bg-current" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      {...interactiveProps}
      className={cn(
        "absolute z-30 flex touch-none items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "inset-y-0 w-4 -translate-x-1/2 cursor-col-resize",
      )}
      style={handlePositionStyle}
    />
  );
}
