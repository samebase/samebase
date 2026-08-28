import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { clampNumber } from "./SidebarLayoutGeometryInternal.ts";
import { acquireSidebarResizeBodyStyleLock } from "./sidebarResizeBodyStyleLock.ts";

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

type SidebarLayoutResizeHandleProps = {
  ariaControls: string;
  ariaLabel: string;
  ariaValueText?: string;
  currentSizePx: number;
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

export function SidebarLayoutResizeHandle({
  ariaControls,
  ariaLabel,
  ariaValueText,
  currentSizePx,
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
}: SidebarLayoutResizeHandleProps) {
  const dragStateRef = useRef<{
    startClientPx: number;
    startSizePx: number;
  } | null>(null);
  const keyboardResizeTimeoutRef = useRef<number | null>(null);
  const resizeSessionActiveRef = useRef(false);
  const resizeSessionEndRef = useRef<(() => void) | undefined>(undefined);
  const [isResizing, setIsResizing] = useState(false);
  const [isPointerResizing, setIsPointerResizing] = useState(false);

  const startResizing = useCallback(() => {
    if (resizeSessionActiveRef.current) {
      return;
    }

    resizeSessionActiveRef.current = true;
    resizeSessionEndRef.current = onResizeEnd;
    onResizeStart?.();
  }, [onResizeEnd, onResizeStart]);

  const finishResizing = useCallback((updateLocalState = true) => {
    if (keyboardResizeTimeoutRef.current !== null) {
      window.clearTimeout(keyboardResizeTimeoutRef.current);
      keyboardResizeTimeoutRef.current = null;
    }
    if (!resizeSessionActiveRef.current) {
      return;
    }

    resizeSessionActiveRef.current = false;
    const endResizeSession = resizeSessionEndRef.current;
    resizeSessionEndRef.current = undefined;
    dragStateRef.current = null;
    if (updateLocalState) {
      setIsPointerResizing(false);
      setIsResizing(false);
    }
    endResizeSession?.();
  }, []);

  useEffect(() => {
    if (!isPointerResizing) {
      return;
    }

    return acquireSidebarResizeBodyStyleLock(document.body);
  }, [isPointerResizing]);

  useEffect(() => {
    return () => {
      finishResizing(false);
    };
  }, [finishResizing]);

  const commitSizeChange = useCallback(
    (nextSizePx: number) => {
      onSizeChange(clampNumber(nextSizePx, minSizePx, maxSizePx));
      onRawSizeChange?.(nextSizePx);
    },
    [maxSizePx, minSizePx, onRawSizeChange, onSizeChange],
  );

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
      startResizing();
      setIsPointerResizing(true);
      setIsResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [currentSizePx, startResizing],
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
      finishResizing();
    },
    [finishResizing],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const deltaPx = getKeyboardResizeDeltaPx(event, resizeFrom);
      if (deltaPx === 0) {
        return;
      }

      event.preventDefault();
      startResizing();
      setIsResizing(true);
      commitSizeChange(currentSizePx + deltaPx);
      if (keyboardResizeTimeoutRef.current !== null) {
        window.clearTimeout(keyboardResizeTimeoutRef.current);
      }
      keyboardResizeTimeoutRef.current = window.setTimeout(() => {
        finishResizing();
      }, KEYBOARD_RESIZE_TIMEOUT_MS);
    },
    [commitSizeChange, currentSizePx, finishResizing, resizeFrom, startResizing],
  );

  const interactiveProps = {
    "aria-controls": ariaControls,
    "aria-label": ariaLabel,
    "aria-orientation": "vertical" as const,
    "aria-valuemax": maxSizePx,
    "aria-valuemin": minSizePx,
    "aria-valuenow": Math.round(currentSizePx),
    "aria-valuetext": ariaValueText,
    "data-resize-mode": pointerTarget,
    "data-resize-side": resizeFrom,
    "data-resizing": isResizing ? "" : undefined,
    "data-sidebar-layout-part": "resize-handle",
    onBlur,
    onFocus,
    onKeyDown: handleKeyDown,
    onLostPointerCapture: () => finishResizing(),
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
        data-sidebar-layout-part="resize-track"
        style={handlePositionStyle}
      >
        <div {...interactiveProps}>
          <div aria-hidden="true" data-sidebar-layout-part="resize-grip-indicator" />
        </div>
      </div>
    );
  }

  return <div {...interactiveProps} style={handlePositionStyle} />;
}
