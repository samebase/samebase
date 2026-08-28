import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { clampNumber } from "./WorkspaceLayoutV2Geometry.ts";
import { acquireWorkspaceResizeBodyStyleLock } from "./workspaceResizeBodyStyleLock.ts";

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

type WorkspaceLayoutV2ResizeHandleProps = {
  ariaLabel: string;
  ariaValueText?: string;
  currentSizePx: number;
  dataTestId: string;
  maxSizePx: number;
  minSizePx: number;
  onBlur?: () => void;
  onFocus?: () => void;
  onRawSizeChange?: (rawSizePx: number) => void;
  onResizeEnd?: () => void;
  onResizeStart?: () => void;
  onSizeChange: (sizePx: number) => void;
  pointerTarget?: "edge" | "grip";
  positionPx: number;
  resizeFrom: "left" | "right";
};

export function WorkspaceLayoutV2ResizeHandle({
  ariaLabel,
  ariaValueText,
  currentSizePx,
  dataTestId,
  maxSizePx,
  minSizePx,
  onBlur,
  onFocus,
  onRawSizeChange,
  onResizeEnd,
  onResizeStart,
  onSizeChange,
  pointerTarget = "edge",
  positionPx,
  resizeFrom,
}: WorkspaceLayoutV2ResizeHandleProps) {
  const dragStateRef = useRef<{
    startClientPx: number;
    startSizePx: number;
  } | null>(null);
  const keyboardResizeTimeoutRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isPointerResizing, setIsPointerResizing] = useState(false);

  useEffect(() => {
    if (!isPointerResizing) {
      return;
    }

    return acquireWorkspaceResizeBodyStyleLock(document.body);
  }, [isPointerResizing]);

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
    setIsPointerResizing(false);
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
      setIsPointerResizing(true);
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

  const interactiveProps = {
    "aria-label": ariaLabel,
    "aria-orientation": "vertical" as const,
    "aria-valuemax": maxSizePx,
    "aria-valuemin": minSizePx,
    "aria-valuenow": Math.round(currentSizePx),
    "aria-valuetext": ariaValueText,
    "data-resize-mode": pointerTarget,
    "data-resize-side": resizeFrom,
    "data-resizing": isResizing ? "" : undefined,
    "data-testid": dataTestId,
    "data-workspace-layout-part": "resize-handle",
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
  const handlePositionStyle = { left: `${positionPx}px` };

  if (pointerTarget === "grip") {
    return (
      <div
        data-resize-side={resizeFrom}
        data-workspace-layout-part="resize-track"
        style={handlePositionStyle}
      >
        <div {...interactiveProps}>
          <div
            aria-hidden="true"
            data-workspace-layout-part="resize-grip-indicator"
            data-workspace-layout-v2-resize-grip-dots
          />
        </div>
      </div>
    );
  }

  return <div {...interactiveProps} style={handlePositionStyle} />;
}
