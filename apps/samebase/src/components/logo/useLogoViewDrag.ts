import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "@/components/logo/logoViewDragConstants";
import {
  resolveLogoViewState,
  type LogoViewDragConfig,
  type LogoViewState,
} from "@/components/logo/logoViewDrag";
import { useRef, type MouseEvent, type PointerEvent } from "react";

const DRAG_THRESHOLD_PX = 4;

type LogoViewDragInteraction = {
  button: 0 | null;
  currentView: LogoViewState;
  pointerId: number | null;
  startView: LogoViewState;
  startX: number;
  startY: number;
  status: "idle" | "pending" | "dragging";
};

type UseLogoViewDragOptions<T extends Element> = {
  elevationDegrees: number;
  onInteractionEnd?: ((finalView: LogoViewState) => void) | undefined;
  onInteractionStart?: (() => void) | undefined;
  onPointerCaptureEnd?: () => void;
  onPointerCaptureStart?: () => void;
  onPress?: (event: PointerEvent<T>) => void;
  onViewChange: (nextView: LogoViewState) => void;
  readCurrentView?: () => LogoViewState;
  rotationDegrees: number;
  viewDragConfig?: LogoViewDragConfig | undefined;
};

export function useLogoViewDrag<T extends Element>({
  elevationDegrees,
  onInteractionEnd,
  onInteractionStart,
  onPointerCaptureEnd,
  onPointerCaptureStart,
  onPress,
  onViewChange,
  readCurrentView,
  rotationDegrees,
  viewDragConfig,
}: UseLogoViewDragOptions<T>) {
  const initialView = { elevationDegrees, rotationDegrees };
  const interactionRef = useRef<LogoViewDragInteraction>({
    button: null,
    currentView: initialView,
    pointerId: null,
    startView: initialView,
    startX: 0,
    startY: 0,
    status: "idle",
  });

  const resetInteraction = (target: T, pointerId: number) => {
    const interaction = interactionRef.current;
    const wasDragging = interaction.status === "dragging";
    const finalView = interaction.currentView;
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }

    interactionRef.current = {
      button: null,
      currentView: finalView,
      pointerId: null,
      startView: finalView,
      startX: 0,
      startY: 0,
      status: "idle",
    };
    if (wasDragging) {
      onInteractionEnd?.(finalView);
    }
    onPointerCaptureEnd?.();
  };

  const handlePointerDown = (event: PointerEvent<T>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const currentView = readCurrentView?.() ?? { elevationDegrees, rotationDegrees };
    interactionRef.current = {
      button: 0,
      currentView,
      pointerId: event.pointerId,
      startView: currentView,
      startX: event.clientX,
      startY: event.clientY,
      status: "pending",
    };
    onPointerCaptureStart?.();
  };

  const handlePointerMove = (event: PointerEvent<T>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button !== 0) {
      return;
    }

    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    if (interaction.status === "pending" && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      interaction.status = "dragging";
      onInteractionStart?.();
    }
    if (interaction.status !== "dragging") {
      return;
    }

    const nextView = resolveLogoViewState({
      config: viewDragConfig,
      disableSnap: event.altKey || event.shiftKey,
      view: {
        elevationDegrees:
          interaction.startView.elevationDegrees + deltaY * DRAG_ELEVATION_DEGREES_PER_PIXEL,
        rotationDegrees:
          interaction.startView.rotationDegrees + deltaX * DRAG_ROTATION_DEGREES_PER_PIXEL,
      },
    });
    interaction.currentView = nextView;
    onViewChange(nextView);
  };

  const handlePointerUp = (event: PointerEvent<T>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button === null) {
      return;
    }

    if (interaction.status !== "dragging") {
      onPress?.(event);
    }
    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<T>) => {
    if (interactionRef.current.pointerId !== event.pointerId) {
      return;
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handleContextMenu = (event: MouseEvent<T>) => {
    event.preventDefault();
  };

  return {
    handleContextMenu,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    interactionRef,
  };
}
