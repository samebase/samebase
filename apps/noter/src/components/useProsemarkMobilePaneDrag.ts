import { useCallback, useEffect, useMemo, useRef } from "react";
import type React from "react";
import { useWorkspaceMobilePaneDrag } from "@/components/useWorkspaceMobilePaneDrag";

const MOBILE_PANE_DRAG_SLOP_PX = 10;

type PointerDragState = {
  lastX: number;
  startX: number;
  startY: number;
  pointerId: number;
  source: "pointer";
  type: "pending" | "shell";
};

type TouchDragState = {
  lastX: number;
  startX: number;
  startY: number;
  source: "touch";
  touchIdentifier: number;
  type: "pending" | "shell";
};

type ProsemarkPaneDragState = PointerDragState | TouchDragState;

function findTouchByIdentifier(
  touchList: TouchList,
  identifier: number,
): Touch | null {
  for (let index = 0; index < touchList.length; index += 1) {
    const touch = touchList.item(index);
    if (touch?.identifier === identifier) {
      return touch;
    }
  }

  return null;
}

/**
 * Delegates clear horizontal drags from a ProseMark surface into the shared
 * mobile workspace carousel while leaving taps and vertical gestures alone.
 */
export function useProsemarkMobilePaneDrag(
  enabled: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const {
    dragMobileShellBy,
    isAvailable,
    isMainPaneActive,
    settleMobileShell,
  } = useWorkspaceMobilePaneDrag();
  const dragStateRef = useRef<ProsemarkPaneDragState | null>(null);
  const isEnabled = enabled && isAvailable;

  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  const resetDragState = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }
      if (
        dragState.source === "pointer" &&
        dragState.type === "shell" &&
        event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      clearDragState();
    },
    [clearDragState],
  );

  const updateDragState = useCallback(
    ({
      clientX,
      clientY,
      currentTarget,
      pointerId,
    }: {
      clientX: number;
      clientY: number;
      currentTarget?: HTMLDivElement;
      pointerId?: number;
    }) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return false;
      }

      if (dragState.type === "pending") {
        const dx = clientX - dragState.startX;
        const dy = clientY - dragState.startY;
        if (
          Math.abs(dx) < MOBILE_PANE_DRAG_SLOP_PX &&
          Math.abs(dy) < MOBILE_PANE_DRAG_SLOP_PX
        ) {
          return false;
        }

        if (Math.abs(dx) <= Math.abs(dy)) {
          clearDragState();
          return false;
        }

        dragState.type = "shell";
        if (
          dragState.source === "pointer" &&
          currentTarget !== undefined &&
          pointerId !== undefined
        ) {
          currentTarget.setPointerCapture(pointerId);
        }
      }

      const deltaX = clientX - dragState.lastX;
      dragState.lastX = clientX;
      if (deltaX === 0) {
        return true;
      }

      dragMobileShellBy(deltaX);
      return true;
    },
    [clearDragState, dragMobileShellBy],
  );

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isEnabled || !isMainPaneActive || !event.isPrimary) {
        return;
      }
      if (event.pointerType === "touch") {
        return;
      }
      if (event.button !== 0) {
        return;
      }
      dragStateRef.current = {
        lastX: event.clientX,
        pointerId: event.pointerId,
        source: "pointer",
        startX: event.clientX,
        startY: event.clientY,
        type: "pending",
      };
    },
    [isEnabled, isMainPaneActive],
  );

  const handlePointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (
        !dragState ||
        dragState.source !== "pointer" ||
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }

      const didDragShell = updateDragState({
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: event.currentTarget,
        pointerId: event.pointerId,
      });
      if (!didDragShell) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [updateDragState],
  );

  const finishShellDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (
        !dragState ||
        dragState.source !== "pointer" ||
        dragState.pointerId !== event.pointerId
      ) {
        return;
      }
      const shouldSettle = dragState.type === "shell";
      resetDragState(event);
      if (shouldSettle) {
        event.preventDefault();
        event.stopPropagation();
        settleMobileShell();
      }
    },
    [resetDragState, settleMobileShell],
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      if (!isEnabled || !isMainPaneActive || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }

      dragStateRef.current = {
        lastX: touch.clientX,
        source: "touch",
        startX: touch.clientX,
        startY: touch.clientY,
        touchIdentifier: touch.identifier,
        type: "pending",
      };
    },
    [isEnabled, isMainPaneActive],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.source !== "touch") {
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          dragState.touchIdentifier,
        ) ?? findTouchByIdentifier(event.touches, dragState.touchIdentifier);
      if (touch === null) {
        return;
      }

      const didDragShell = updateDragState({
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
      if (!didDragShell) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [updateDragState],
  );

  const finishTouchDrag = useCallback(
    (event: TouchEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.source !== "touch") {
        return;
      }

      const touch =
        findTouchByIdentifier(
          event.changedTouches,
          dragState.touchIdentifier,
        ) ?? findTouchByIdentifier(event.touches, dragState.touchIdentifier);
      if (touch === null && event.type !== "touchcancel") {
        return;
      }

      const shouldSettle = dragState.type === "shell";
      clearDragState();
      if (shouldSettle) {
        event.preventDefault();
        event.stopPropagation();
        settleMobileShell();
      }
    },
    [clearDragState, settleMobileShell],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isEnabled) {
      return;
    }

    container.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: false,
    });
    container.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: false,
    });
    container.addEventListener("touchend", finishTouchDrag, {
      capture: true,
      passive: false,
    });
    container.addEventListener("touchcancel", finishTouchDrag, {
      capture: true,
      passive: false,
    });

    return () => {
      container.removeEventListener("touchstart", handleTouchStart, true);
      container.removeEventListener("touchmove", handleTouchMove, true);
      container.removeEventListener("touchend", finishTouchDrag, true);
      container.removeEventListener("touchcancel", finishTouchDrag, true);
    };
  }, [
    containerRef,
    finishTouchDrag,
    handleTouchMove,
    handleTouchStart,
    isEnabled,
  ]);

  return useMemo(
    () => ({
      containerProps: {
        onPointerCancelCapture: finishShellDrag,
        onPointerDownCapture: handlePointerDownCapture,
        onPointerMoveCapture: handlePointerMoveCapture,
        onPointerUpCapture: finishShellDrag,
      },
      touchAction: isEnabled ? "pan-y" : undefined,
    }),
    [
      finishShellDrag,
      handlePointerDownCapture,
      handlePointerMoveCapture,
      isEnabled,
    ],
  );
}
