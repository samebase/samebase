import { useEffect, useRef, useState } from "react";

export interface TouchGestureOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  swipeThreshold?: number;
  velocityThreshold?: number;
  edgeThreshold?: number; // Distance from edge to trigger edge swipe
}

export function useTouchGestures(options: TouchGestureOptions = {}) {
  const {
    onSwipeRight,
    onSwipeLeft,
    swipeThreshold = 50,
    velocityThreshold = 0.3,
    edgeThreshold = 30,
  } = options;

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = (e: Event) => {
    const touchEvent = e as TouchEvent;
    const touch = touchEvent.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    setIsSwiping(false);
  };

  const handleTouchMove = (e: Event) => {
    if (!touchStart.current) return;

    const touchEvent = e as TouchEvent;
    const touch = touchEvent.touches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;

    // Determine if this is a horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
      setIsSwiping(true);
      // Prevent scrolling during horizontal swipe
      if (Math.abs(deltaX) > 20) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = (e: Event) => {
    if (!touchStart.current) return;

    const touchEvent = e as TouchEvent;
    const touch = touchEvent.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    const deltaTime = Date.now() - touchStart.current.time;

    const distance = Math.abs(deltaX);
    const velocity = distance / deltaTime;

    // Check if this qualifies as a swipe
    const isSwipe = distance > swipeThreshold || velocity > velocityThreshold;
    const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

    if (isSwipe && isHorizontal) {
      // Check for edge swipe (swipe from left edge)
      const isEdgeSwipe = touchStart.current.x <= edgeThreshold;

      if (deltaX > 0) {
        // Swipe right
        if (onSwipeRight && (isEdgeSwipe || isSwiping)) {
          onSwipeRight();
        }
      } else {
        // Swipe left
        if (onSwipeLeft) {
          onSwipeLeft();
        }
      }
    }

    touchStart.current = null;
    setIsSwiping(false);
  };

  const attachListeners = (element: HTMLElement | Document = document) => {
    const options = { passive: false };

    element.addEventListener("touchstart", handleTouchStart, options);
    element.addEventListener("touchmove", handleTouchMove, options);
    element.addEventListener("touchend", handleTouchEnd, options);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
    };
  };

  return { attachListeners, isSwiping };
}

// Hook for edge-swipe specifically to open sidebar
export function useSwipeToOpenSidebar(onOpen: () => void) {
  const { attachListeners } = useTouchGestures({
    onSwipeRight: onOpen,
    edgeThreshold: 20, // Very close to edge
    swipeThreshold: 80, // Need a decent swipe
    velocityThreshold: 0.4, // Or fast swipe
  });

  useEffect(() => {
    const cleanup = attachListeners();
    return cleanup;
  }, [attachListeners]);
}
