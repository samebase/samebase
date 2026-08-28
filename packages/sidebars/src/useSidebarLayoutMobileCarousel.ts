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
import { useSidebarLayoutActions } from "./SidebarRuntimeInternal.tsx";

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
  const scrollDerivedMobilePaneRef = useRef<MobilePane | null>(null);
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
      carouselNode.scrollLeft = nextScrollLeftPx;
      setIsMobilePaneSettledEffect(true);
      hasAlignedInitialMobilePaneRef.current = true;
      return;
    }

    if (scrollDerivedMobilePaneRef.current === mobilePane) {
      scrollDerivedMobilePaneRef.current = null;
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
    const syncCurrentPaneFromScroll = () => {
      syncPaneFromScroll(carouselNode);
    };
    const handleScroll = () => {
      syncCurrentPaneFromScroll();
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(() => {
        syncCurrentPaneFromScroll();
      }, 80);
    };

    carouselNode.addEventListener("scroll", handleScroll, { passive: true });
    syncCurrentPaneFromScroll();

    return () => {
      carouselNode.removeEventListener("scroll", handleScroll);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
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
