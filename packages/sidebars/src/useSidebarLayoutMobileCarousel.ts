import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  getMobilePaneFromScrollLeft,
  getMobilePaneScrollLeftPx,
  getMobilePaneScrollProgress,
  isMobilePaneScrollSettled,
  type MobilePane,
  type SidebarLayoutMobileMergedSide,
} from "./SidebarLayoutGeometryInternal.ts";
import { readIsMobileSidebarLayout, useSidebarLayoutActions } from "./SidebarRuntimeInternal.tsx";

/**
The scroll position is the pane. Everything else sets it once, only when no scroll position exists
yet: the server HTML and its inline scripts for a page load, and this controller's first alignment
for a client-only mount. After that, this controller reads the pane from the position on each
scroll. It writes the position only for a pane change that did not come from a scroll (a toggle, a
saved state from another device, a pane that disappears), and never while a touch owns it. The
table of who writes the pane in each phase is in the package README.
*/
export function useSidebarLayoutMobileCarouselController({
  activeGripResizeSideRef,
  carouselRef,
  hasLeftPane,
  hasRightPane,
  isMobile,
  leftWidthPx,
  mainWidthPx,
  mergedSurfaceSide,
  mobilePane,
  rightWidthPx,
  setMobilePane,
  viewportWidthPx,
}: {
  activeGripResizeSideRef: RefObject<"left" | "right" | null>;
  carouselRef: RefObject<HTMLDivElement | null>;
  hasLeftPane: boolean;
  hasRightPane: boolean;
  isMobile: boolean;
  leftWidthPx: number;
  mainWidthPx: number;
  mergedSurfaceSide: SidebarLayoutMobileMergedSide | null;
  mobilePane: MobilePane;
  rightWidthPx: number;
  setMobilePane: Dispatch<SetStateAction<MobilePane>>;
  viewportWidthPx: number;
}) {
  const hasAlignedInitialMobilePaneRef = useRef(false);
  const isScrollPositionFromServerHtmlRef = useRef(false);
  const scrollDerivedMobilePaneRef = useRef<MobilePane | null>(null);
  // A touch owns the position from its start until 80 ms after the last scroll event that follows
  // it: the finger, then the momentum and the snap.
  const touchOwnsScrollRef = useRef(false);
  const { setIsMobilePaneSettled, setMobilePaneScrollProgress } = useSidebarLayoutActions();
  const setIsMobilePaneSettledEffect = useEffectEvent((isSettled: boolean) => {
    setIsMobilePaneSettled(isSettled);
  });
  const setMobilePaneScrollProgressEffect = useEffectEvent((progress: number) => {
    setMobilePaneScrollProgress(progress);
  });
  const canSyncScroll = isMobile && viewportWidthPx > 0 && mainWidthPx > 0;
  const syncPaneFromScroll = useEffectEvent((carouselNode: HTMLDivElement) => {
    if (activeGripResizeSideRef.current !== null) {
      return;
    }

    const nextPane = getMobilePaneFromScrollLeft({
      hasLeftPane,
      hasRightPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      rightWidthPx,
      scrollLeftPx: carouselNode.scrollLeft,
      viewportWidthPx,
    });
    setMobilePaneScrollProgress(
      getMobilePaneScrollProgress({
        hasLeftPane,
        hasRightPane,
        leftWidthPx,
        mainWidthPx,
        mergedSurfaceSide,
        rightWidthPx,
        scrollLeftPx: carouselNode.scrollLeft,
        viewportWidthPx,
      }),
    );
    const isScrollSettled = isMobilePaneScrollSettled({
      hasLeftPane,
      hasRightPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      pane: nextPane,
      rightWidthPx,
      scrollLeftPx: carouselNode.scrollLeft,
      viewportWidthPx,
    });
    setIsMobilePaneSettled(isScrollSettled);
    if (mergedSurfaceSide !== null && !isScrollSettled) {
      return;
    }
    if (mobilePane === nextPane) {
      return;
    }
    setMobilePane((currentPane) => {
      if (currentPane === nextPane) {
        return currentPane;
      }

      scrollDerivedMobilePaneRef.current =
        mergedSurfaceSide !== null && currentPane === mergedSurfaceSide ? null : nextPane;
      return nextPane;
    });
  });

  // A hydration renders the desktop layout first. On a phone, its carousel is already on a pane: the
  // server HTML put it there, and the user may have swiped since. A client-only mount starts at 0.
  const readScrollPositionOrigin = useEffectEvent(() => {
    isScrollPositionFromServerHtmlRef.current = !isMobile && readIsMobileSidebarLayout();
  });
  useLayoutEffect(() => {
    readScrollPositionOrigin();
  }, []);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    hasAlignedInitialMobilePaneRef.current = false;
    scrollDerivedMobilePaneRef.current = null;
    setIsMobilePaneSettledEffect(true);
  }, [isMobile]);

  useLayoutEffect(() => {
    const carouselNode = carouselRef.current;
    if (!isMobile || carouselNode === null || mainWidthPx <= 0) {
      return;
    }
    if (!hasLeftPane && scrollDerivedMobilePaneRef.current === "left") {
      scrollDerivedMobilePaneRef.current = null;
    }
    if (!hasRightPane && scrollDerivedMobilePaneRef.current === "right") {
      scrollDerivedMobilePaneRef.current = null;
    }
    if (activeGripResizeSideRef.current !== null) {
      return;
    }

    const nextScrollLeftPx = getMobilePaneScrollLeftPx(mobilePane, {
      hasLeftPane,
      hasRightPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      rightWidthPx,
      viewportWidthPx,
    });

    if (!hasAlignedInitialMobilePaneRef.current) {
      hasAlignedInitialMobilePaneRef.current = true;
      if (isScrollPositionFromServerHtmlRef.current) {
        isScrollPositionFromServerHtmlRef.current = false;
        syncPaneFromScroll(carouselNode);
        return;
      }

      carouselNode.scrollLeft = nextScrollLeftPx;
      setIsMobilePaneSettledEffect(true);
      return;
    }

    if (scrollDerivedMobilePaneRef.current === mobilePane) {
      scrollDerivedMobilePaneRef.current = null;
      return;
    }
    if (touchOwnsScrollRef.current) {
      // The settle after the touch reads the pane from the position instead.
      return;
    }

    carouselNode.scrollLeft = nextScrollLeftPx;
    setIsMobilePaneSettledEffect(true);
  }, [
    activeGripResizeSideRef,
    carouselRef,
    hasLeftPane,
    hasRightPane,
    isMobile,
    leftWidthPx,
    mainWidthPx,
    mergedSurfaceSide,
    mobilePane,
    rightWidthPx,
    viewportWidthPx,
  ]);

  useEffect(() => {
    if (!canSyncScroll) {
      setMobilePaneScrollProgressEffect(0);
      return;
    }

    const carouselNode = carouselRef.current;
    if (carouselNode === null) {
      setMobilePaneScrollProgressEffect(0);
      return;
    }

    let settleTimeoutId: number | null = null;
    let isTouchDown = false;
    const settle = () => {
      settleTimeoutId = null;
      if (!isTouchDown) {
        touchOwnsScrollRef.current = false;
      }
      syncPaneFromScroll(carouselNode);
    };
    const scheduleSettle = () => {
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(settle, 80);
    };
    const handleScroll = () => {
      syncPaneFromScroll(carouselNode);
      scheduleSettle();
    };
    const handleTouchStart = () => {
      isTouchDown = true;
      touchOwnsScrollRef.current = true;
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        return;
      }
      isTouchDown = false;
      scheduleSettle();
    };

    carouselNode.addEventListener("scroll", handleScroll, { passive: true });
    carouselNode.addEventListener("touchstart", handleTouchStart, { passive: true });
    carouselNode.addEventListener("touchend", handleTouchEnd, { passive: true });
    carouselNode.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    syncPaneFromScroll(carouselNode);

    return () => {
      carouselNode.removeEventListener("scroll", handleScroll);
      carouselNode.removeEventListener("touchstart", handleTouchStart);
      carouselNode.removeEventListener("touchend", handleTouchEnd);
      carouselNode.removeEventListener("touchcancel", handleTouchEnd);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      touchOwnsScrollRef.current = false;
    };
  }, [canSyncScroll, carouselRef]);

  useEffect(() => {
    const carouselNode = carouselRef.current;
    if (!canSyncScroll || carouselNode === null) {
      return;
    }

    syncPaneFromScroll(carouselNode);
  }, [
    canSyncScroll,
    carouselRef,
    hasLeftPane,
    hasRightPane,
    leftWidthPx,
    mainWidthPx,
    mergedSurfaceSide,
    rightWidthPx,
    viewportWidthPx,
  ]);
}
