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
  getMobilePaneScrollProgress,
  getMobilePaneScrollLeftPx,
  isMobilePaneScrollSettled,
  type MobilePane,
  type WorkspaceLayoutV2MobileMergedSide,
} from "./WorkspaceLayoutV2Geometry";
import { useWorkspaceLayoutV2Actions, type WorkspaceMobilePane } from "./WorkspacePaneRuntime";

const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Owns the browser scroll lifecycle for the mobile pane carousel.
 *
 * Pane geometry can change while the carousel node and scroll subscription stay
 * the same. `useEffectEvent` lets the scroll handler read the latest geometry
 * without resubscribing the browser listener on every width update.
 */
export function useWorkspaceLayoutV2MobileCarouselController({
  activeGripResizeSideRef,
  carouselRef,
  hasLeftPane,
  hasRightPane,
  isMobile,
  leftWidthPx,
  mainWidthPx,
  mergedSurfaceSide,
  mobilePane,
  mobilePaneNavigationRequest,
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
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
  mobilePane: MobilePane;
  mobilePaneNavigationRequest: WorkspaceMobilePane | null;
  rightWidthPx: number;
  setMobilePane: Dispatch<SetStateAction<MobilePane>>;
  viewportWidthPx: number;
}) {
  const hasAlignedInitialMobilePaneRef = useRef(false);
  const handledMobilePaneNavigationRequestRef = useRef<WorkspaceMobilePane | null>(null);
  const scrollDerivedMobilePaneRef = useRef<MobilePane | null>(null);
  const { setIsMobilePaneSettled, setMobilePaneNavigationRequest, setMobilePaneScrollProgress } =
    useWorkspaceLayoutV2Actions();
  const setIsMobilePaneSettledEffect = useEffectEvent((isSettled: boolean) => {
    setIsMobilePaneSettled(isSettled);
  });
  const setMobilePaneScrollProgressEffect = useEffectEvent((progress: number) => {
    setMobilePaneScrollProgress(progress);
  });
  const finishMobilePaneNavigationRequestEffect = useEffectEvent(() => {
    handledMobilePaneNavigationRequestRef.current = null;
    setMobilePaneNavigationRequest(null);
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
      hasRightPane,
      hasLeftPane,
      leftWidthPx,
      mainWidthPx,
      mergedSurfaceSide,
      pane: nextPane,
      rightWidthPx,
      scrollLeftPx: carouselNode.scrollLeft,
      viewportWidthPx,
    });
    setIsMobilePaneSettled(isScrollSettled);
    if (isScrollSettled && mobilePaneNavigationRequest === nextPane) {
      handledMobilePaneNavigationRequestRef.current = null;
      setMobilePaneNavigationRequest(null);
    }
    if (mergedSurfaceSide !== null && !isScrollSettled) {
      return;
    }
    // `mobilePane` already accounts for panes unavailable on this route. Do not
    // write that local fallback over the account's shared pane preference.
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

  /**
   * Resets mobile carousel bookkeeping when leaving mobile mode so the next
   * mobile mount performs a fresh first-paint alignment.
   */
  useEffect(() => {
    if (isMobile) {
      return;
    }

    hasAlignedInitialMobilePaneRef.current = false;
    handledMobilePaneNavigationRequestRef.current = null;
    scrollDerivedMobilePaneRef.current = null;
    setIsMobilePaneSettledEffect(true);
  }, [isMobile]);

  /**
   * Aligns the native carousel scroll position to the selected mobile pane
   * before paint, while ignoring scroll positions produced by active grip drags.
   */
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
      // Align the first mobile paint to the current sidebar state so refreshes
      // keep the intended pane instead of booting at scrollLeft=0 and
      // immediately persisting "left".
      carouselNode.scrollLeft = nextScrollLeftPx;
      setIsMobilePaneSettledEffect(true);
      hasAlignedInitialMobilePaneRef.current = true;
      return;
    }

    if (
      mobilePaneNavigationRequest !== null &&
      handledMobilePaneNavigationRequestRef.current !== mobilePaneNavigationRequest
    ) {
      handledMobilePaneNavigationRequestRef.current = mobilePaneNavigationRequest;
      const requestedPaneIsAvailable =
        mobilePaneNavigationRequest === "main" ||
        (mobilePaneNavigationRequest === "left" && hasLeftPane) ||
        (mobilePaneNavigationRequest === "right" && hasRightPane);
      if (!requestedPaneIsAvailable) {
        handledMobilePaneNavigationRequestRef.current = null;
        setMobilePaneNavigationRequest(null);
        return;
      }

      const requestedScrollLeftPx = getMobilePaneScrollLeftPx(mobilePaneNavigationRequest, {
        hasLeftPane,
        hasRightPane,
        leftWidthPx,
        mainWidthPx,
        mergedSurfaceSide,
        rightWidthPx,
        viewportWidthPx,
      });
      if (
        window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches ||
        Math.abs(carouselNode.scrollLeft - requestedScrollLeftPx) < 1
      ) {
        carouselNode.scrollLeft = requestedScrollLeftPx;
        setMobilePane(mobilePaneNavigationRequest);
        setIsMobilePaneSettledEffect(true);
        handledMobilePaneNavigationRequestRef.current = null;
        setMobilePaneNavigationRequest(null);
        return;
      }

      setIsMobilePaneSettledEffect(false);
      carouselNode.scrollTo({
        behavior: "smooth",
        left: requestedScrollLeftPx,
      });
      return;
    }

    if (mobilePaneNavigationRequest !== null) {
      return;
    }

    if (scrollDerivedMobilePaneRef.current === mobilePane) {
      scrollDerivedMobilePaneRef.current = null;
      return;
    }

    // Keep programmatic pane changes, such as file selection recentering, in
    // lockstep with the native carousel position after the initial boot.
    carouselNode.scrollLeft = nextScrollLeftPx;
    setIsMobilePaneSettledEffect(true);
  }, [
    activeGripResizeSideRef,
    carouselRef,
    hasRightPane,
    hasLeftPane,
    isMobile,
    leftWidthPx,
    mobilePane,
    mainWidthPx,
    mergedSurfaceSide,
    mobilePaneNavigationRequest,
    rightWidthPx,
    setMobilePane,
    setMobilePaneNavigationRequest,
    viewportWidthPx,
  ]);

  /**
   * Owns the browser scroll listener while the carousel is active and converts
   * native scroll movement into selected-pane and settled-state updates.
   */
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
        finishMobilePaneNavigationRequestEffect();
      }, 80);
    };

    carouselNode.addEventListener("scroll", handleScroll, {
      passive: true,
    });
    syncCurrentPaneFromScroll();

    return () => {
      carouselNode.removeEventListener("scroll", handleScroll);
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [canSyncScroll, carouselRef]);

  /**
   * Re-evaluates the current scroll position after pane geometry changes that
   * do not require rebuilding the underlying browser scroll listener.
   */
  useEffect(() => {
    const carouselNode = carouselRef.current;
    if (!canSyncScroll || carouselNode === null) {
      return;
    }

    syncPaneFromScroll(carouselNode);
  }, [
    canSyncScroll,
    carouselRef,
    hasRightPane,
    hasLeftPane,
    leftWidthPx,
    mainWidthPx,
    mergedSurfaceSide,
    rightWidthPx,
    viewportWidthPx,
  ]);
}
