import * as React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/sidebar";
import {
  MachinesWorkspaceSidebarRail,
  type MachinesWorkspaceViewProps,
} from "@/components/MachinesWorkspaceSidebarRail";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import type { MobileSidebarPane } from "@/hooks/use-sidebar";
import { useSidebar } from "@/hooks/use-sidebar";
import { WorkspaceMobilePaneDragProvider } from "@/components/workspace-layout/workspaceMobilePaneDrag";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
import { WorkspaceSidebarResizeHandle } from "@/components/workspace-layout/WorkspaceSidebarResizeHandle";
import {
  clampWorkspaceDesktopSidebarWidthPx,
  clampWorkspaceMobileSidebarWidthPx,
  getWorkspaceDesktopSidebarWidthRange,
  resolveWorkspaceDesktopSidebarWidths,
} from "@/lib/workspacePaneSizes";
import { cn } from "@/lib/utils";

function useElementWidth(measureRef: React.RefObject<HTMLElement | null>) {
  const [widthPx, setWidthPx] = React.useState(0);

  React.useLayoutEffect(() => {
    const measuredNode = measureRef.current;
    if (!measuredNode) {
      return;
    }

    const updateWidth = () => {
      setWidthPx(
        Math.max(0, Math.round(measuredNode.getBoundingClientRect().width)),
      );
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(measuredNode);
    window.addEventListener("resize", updateWidth);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [measureRef]);

  return widthPx;
}

function readAdjacentOnlySettledPane(args: {
  currentPane: MobileSidebarPane;
  mainPaneScrollLeft: number;
  rightPaneScrollLeft: number;
  scrollLeft: number;
}): MobileSidebarPane {
  const candidates: Array<{
    distance: number;
    pane: MobileSidebarPane;
  }> = [
    {
      distance: Math.abs(args.scrollLeft - 0),
      pane: "left",
    },
    {
      distance: Math.abs(args.scrollLeft - args.mainPaneScrollLeft),
      pane: "main",
    },
    {
      distance: Math.abs(args.scrollLeft - args.rightPaneScrollLeft),
      pane: "right",
    },
  ];
  candidates.sort((left, right) => left.distance - right.distance);
  const nearestPane = candidates[0]?.pane ?? "main";

  if (args.currentPane === "left" && nearestPane === "right") {
    return "main";
  }
  if (args.currentPane === "right" && nearestPane === "left") {
    return "main";
  }

  return nearestPane;
}

function MachinesWorkspaceV2Shell(props: MachinesWorkspaceViewProps) {
  const {
    isMobile,
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane,
    rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
    setLeftDesktopWidthPx,
    setMobilePane,
    setRightDesktopWidthPx,
  } = useSidebar();
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const hasInitializedMobileScrollRef = React.useRef(false);
  const nativeGestureStartPaneRef = React.useRef<MobileSidebarPane | null>(
    null,
  );
  const delegatedGestureStartPaneRef = React.useRef<MobileSidebarPane | null>(
    null,
  );
  const snapRestoreFrameRef = React.useRef<number | null>(null);
  const shellWidthPx = useElementWidth(shellRef);
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;

  const resolvedDesktopSidebarWidths =
    shellWidthPx > 0
      ? resolveWorkspaceDesktopSidebarWidths({
          containerWidthPx: shellWidthPx,
          leftOpen: leftDesktopOpen,
          leftWidthPx: leftDesktopWidthPx,
          rightOpen: rightDesktopOpen,
          rightWidthPx: rightDesktopWidthPx,
        })
      : {
          leftWidthPx: leftDesktopOpen ? leftDesktopWidthPx : 0,
          rightWidthPx: rightDesktopOpen ? rightDesktopWidthPx : 0,
        };
  const resolvedLeftMobileSidebarWidthPx =
    shellWidthPx > 0
      ? clampWorkspaceMobileSidebarWidthPx(leftMobileWidthPx, shellWidthPx)
      : leftMobileWidthPx;
  const resolvedRightMobileSidebarWidthPx =
    shellWidthPx > 0
      ? clampWorkspaceMobileSidebarWidthPx(rightMobileWidthPx, shellWidthPx)
      : rightMobileWidthPx;

  const leftSidebarWidthPx = isMobile
    ? resolvedLeftMobileSidebarWidthPx
    : leftDesktopOpen
      ? resolvedDesktopSidebarWidths.leftWidthPx
      : 0;
  const rightSidebarWidthPx = isMobile
    ? resolvedRightMobileSidebarWidthPx
    : rightDesktopOpen
      ? resolvedDesktopSidebarWidths.rightWidthPx
      : 0;
  const mainPaneScrollLeft = leftSidebarWidthPx;
  const rightPaneScrollLeft = leftSidebarWidthPx + rightSidebarWidthPx;
  const maxMobileScrollLeft = rightPaneScrollLeft;

  const leftDesktopResizeRange =
    shellWidthPx > 0
      ? getWorkspaceDesktopSidebarWidthRange(
          shellWidthPx,
          rightDesktopOpen ? rightSidebarWidthPx : 0,
        )
      : null;
  const rightDesktopResizeRange =
    shellWidthPx > 0
      ? getWorkspaceDesktopSidebarWidthRange(
          shellWidthPx,
          leftDesktopOpen ? leftSidebarWidthPx : 0,
        )
      : null;
  const showLeftResizeHandle =
    !isMobile && leftDesktopOpen && shellWidthPx > 0 && leftDesktopResizeRange;
  const showRightResizeHandle =
    !isMobile &&
    rightDesktopOpen &&
    shellWidthPx > 0 &&
    rightDesktopResizeRange;

  const setMobileSnapEnabled = React.useCallback((enabled: boolean) => {
    const snapType = enabled ? "" : "none";

    if (shellRef.current !== null) {
      shellRef.current.style.scrollSnapType = snapType;
    }
    if (trackRef.current !== null) {
      trackRef.current.style.scrollSnapType = snapType;
    }
  }, []);

  const scheduleSnapRestore = React.useCallback(() => {
    if (snapRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(snapRestoreFrameRef.current);
    }

    snapRestoreFrameRef.current = window.requestAnimationFrame(() => {
      snapRestoreFrameRef.current = null;
      setMobileSnapEnabled(true);
    });
  }, [setMobileSnapEnabled]);

  const getScrollLeftForPane = React.useCallback(
    (pane: MobileSidebarPane) => {
      if (pane === "left") {
        return 0;
      }
      if (pane === "right") {
        return rightPaneScrollLeft;
      }
      return mainPaneScrollLeft;
    },
    [mainPaneScrollLeft, rightPaneScrollLeft],
  );

  const settleMobileShell = React.useCallback(() => {
    if (!isMobile) {
      return;
    }

    const scrollNode = shellRef.current;
    if (scrollNode === null) {
      scheduleSnapRestore();
      return;
    }

    const gestureStartPane =
      delegatedGestureStartPaneRef.current ??
      nativeGestureStartPaneRef.current ??
      mobilePane;
    delegatedGestureStartPaneRef.current = null;
    nativeGestureStartPaneRef.current = null;

    const nextPane = readAdjacentOnlySettledPane({
      currentPane: gestureStartPane,
      mainPaneScrollLeft,
      rightPaneScrollLeft,
      scrollLeft: scrollNode.scrollLeft,
    });
    if (nextPane !== mobilePane) {
      setMobilePane(nextPane);
    }

    const targetScrollLeft = getScrollLeftForPane(nextPane);
    if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) > 1) {
      scrollNode.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });
    }

    scheduleSnapRestore();
  }, [
    getScrollLeftForPane,
    isMobile,
    mainPaneScrollLeft,
    mobilePane,
    rightPaneScrollLeft,
    scheduleSnapRestore,
    setMobilePane,
  ]);

  const dragMobileShellBy = React.useCallback(
    (pointerDeltaX: number) => {
      if (!isMobile || maxMobileScrollLeft <= 0) {
        return false;
      }

      const scrollNode = shellRef.current;
      if (scrollNode === null) {
        return false;
      }

      const gestureStartPane =
        delegatedGestureStartPaneRef.current ?? mobilePane;
      delegatedGestureStartPaneRef.current = gestureStartPane;
      const minScrollLeft =
        gestureStartPane === "right" ? mainPaneScrollLeft : 0;
      const maxScrollLeft =
        gestureStartPane === "left" ? mainPaneScrollLeft : maxMobileScrollLeft;
      const nextScrollLeft = Math.max(
        minScrollLeft,
        Math.min(maxScrollLeft, scrollNode.scrollLeft - pointerDeltaX),
      );
      if (Math.abs(nextScrollLeft - scrollNode.scrollLeft) <= 0.5) {
        return false;
      }

      setMobileSnapEnabled(false);
      scrollNode.scrollLeft = nextScrollLeft;
      return true;
    },
    [
      isMobile,
      mainPaneScrollLeft,
      maxMobileScrollLeft,
      mobilePane,
      setMobileSnapEnabled,
    ],
  );

  const mobilePaneDragContextValue = React.useMemo(
    () => ({
      dragMobileShellBy,
      isAvailable: isMobile && maxMobileScrollLeft > 0,
      settleMobileShell,
    }),
    [dragMobileShellBy, isMobile, maxMobileScrollLeft, settleMobileShell],
  );

  const scrollMobilePaneIntoPlace = React.useCallback(
    (behavior: ScrollBehavior) => {
      if (!isMobile) {
        return;
      }

      const scrollNode = shellRef.current;
      if (scrollNode === null) {
        return;
      }

      const targetScrollLeft = getScrollLeftForPane(mobilePane);
      if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) <= 1) {
        scheduleSnapRestore();
        return;
      }

      scrollNode.scrollTo({
        left: targetScrollLeft,
        behavior,
      });
      scheduleSnapRestore();
    },
    [getScrollLeftForPane, isMobile, mobilePane, scheduleSnapRestore],
  );

  React.useEffect(() => {
    if (!isMobile || shellWidthPx <= 0) {
      hasInitializedMobileScrollRef.current = false;
      delegatedGestureStartPaneRef.current = null;
      nativeGestureStartPaneRef.current = null;
      return;
    }

    const scrollNode = shellRef.current;
    if (scrollNode === null) {
      return;
    }

    if (!hasInitializedMobileScrollRef.current) {
      scrollNode.scrollLeft = getScrollLeftForPane(mobilePane);
      hasInitializedMobileScrollRef.current = true;
      return;
    }

    scrollMobilePaneIntoPlace("smooth");
  }, [
    getScrollLeftForPane,
    isMobile,
    mobilePane,
    scrollMobilePaneIntoPlace,
    shellWidthPx,
  ]);

  React.useEffect(() => {
    if (!isMobile) {
      return;
    }

    const scrollNode = shellRef.current;
    if (scrollNode === null) {
      return;
    }

    const supportsScrollEnd = "onscrollend" in scrollNode;
    let settleTimeoutId: number | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        nativeGestureStartPaneRef.current = null;
        return;
      }

      nativeGestureStartPaneRef.current = mobilePane;
    };
    const handleScroll = () => {
      if (supportsScrollEnd) {
        return;
      }

      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(settleMobileShell, 120);
    };

    scrollNode.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    scrollNode.addEventListener("scroll", handleScroll, { passive: true });
    if (supportsScrollEnd) {
      scrollNode.addEventListener("scrollend", settleMobileShell);
    }

    return () => {
      scrollNode.removeEventListener("touchstart", handleTouchStart);
      scrollNode.removeEventListener("scroll", handleScroll);
      if (supportsScrollEnd) {
        scrollNode.removeEventListener("scrollend", settleMobileShell);
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [isMobile, mobilePane, settleMobileShell]);

  React.useEffect(() => {
    return () => {
      if (snapRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(snapRestoreFrameRef.current);
      }
      delegatedGestureStartPaneRef.current = null;
      nativeGestureStartPaneRef.current = null;
      setMobileSnapEnabled(true);
    };
  }, [setMobileSnapEnabled]);

  const handleThreadSelect = React.useCallback(
    (selection: { machineId: string; threadId: string }) => {
      props.onThreadSelect?.(selection);
      if (isMobile) {
        setMobilePane("main");
      }
    },
    [isMobile, props, setMobilePane],
  );

  const shellStyle: React.CSSProperties = isMobile
    ? {
        gridTemplateColumns: `${leftSidebarWidthPx}px minmax(0, 1fr) ${rightSidebarWidthPx}px`,
        width: `calc(${leftSidebarWidthPx}px + 100% + ${rightSidebarWidthPx}px)`,
      }
    : {
        gridTemplateColumns: `${leftDesktopOpen ? `${leftSidebarWidthPx}px` : "0px"} minmax(0, 1fr) ${rightDesktopOpen ? `${rightSidebarWidthPx}px` : "0px"}`,
      };

  return (
    <WorkspaceMobilePaneDragProvider value={mobilePaneDragContextValue}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div
          ref={shellRef}
          data-testid={props.dataTestId}
          data-mobile-pane={isMobile ? mobilePane : undefined}
          data-sidebar-shell={
            isMobile ? "machines-v2-mobile" : "machines-v2-desktop"
          }
          className={cn(
            "relative min-h-0 flex-1",
            isMobile
              ? "overflow-x-auto overflow-y-hidden overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              : "overflow-hidden",
          )}
        >
          <div
            ref={trackRef}
            className={cn(
              "grid h-full min-h-0",
              isMobile ? "snap-x snap-mandatory" : null,
            )}
            style={shellStyle}
          >
            {(isMobile || leftDesktopOpen) && leftSidebarWidthPx > 0 ? (
              <aside
                className={cn(
                  "min-h-0 overflow-hidden border-r border-border/60 bg-background",
                  isMobile ? "snap-start snap-always" : null,
                )}
                style={{ width: `${leftSidebarWidthPx}px` }}
              >
                <MachinesWorkspaceSidebarRail
                  dataTestId={sidebarTestId}
                  machineInventories={props.machineInventories}
                  selectedMachineId={props.selectedMachineId}
                  selectedThreadId={props.selectedThreadId}
                  pendingPinThreadKey={props.pendingPinThreadKey}
                  relativeTimeReferenceMs={props.relativeTimeReferenceMs}
                  onThreadPinChange={props.onThreadPinChange}
                  onThreadSelect={handleThreadSelect}
                />
              </aside>
            ) : null}

            <div
              className={cn(
                "relative min-h-0 min-w-0 bg-background",
                isMobile ? "snap-start snap-always" : null,
              )}
            >
              <div className="flex h-full min-h-0 flex-col bg-background">
                <div
                  data-testid={headerTestId}
                  className="border-b border-border/60 bg-background/95 px-3 py-2 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <SidebarTrigger
                        className="sr-only h-8 w-8 md:not-sr-only md:inline-flex md:h-6 md:w-6"
                        side="left"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          Machines
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <SidebarTrigger
                        className="sr-only h-8 w-8 md:not-sr-only md:inline-flex md:h-6 md:w-6"
                        side="right"
                      />
                    </div>
                  </div>
                </div>

                <WorkspaceScene
                  workspacePaneClassName="min-h-0 flex-1 bg-background"
                  workspaceScrollClassName="overflow-hidden bg-background"
                  workspaceBody={
                    <MachinesWorkspaceThreadPane
                      errorMessage={props.selectedThreadError}
                      isLoading={props.selectedThreadLoading}
                      isSubmittingTurn={props.isSubmittingTurn}
                      mobilePaneDragEnabled={isMobile}
                      onTurnDraftChange={props.onTurnDraftChange}
                      onTurnSubmit={props.onTurnSubmit}
                      selectedMachineDisplayName={
                        props.selectedMachineDisplayName
                      }
                      selectedMachineHostname={props.selectedMachineHostname}
                      selectedMachineStatusReason={
                        props.selectedMachineStatusReason
                      }
                      selectedThreadId={props.selectedThreadId}
                      thread={props.selectedThread}
                      turnDraft={props.turnDraft}
                    />
                  }
                />
              </div>

              {isMobile && mobilePane !== "main" ? (
                <button
                  type="button"
                  aria-label="Return to thread view"
                  className="absolute inset-0 z-10 bg-black/10"
                  onClick={() => {
                    setMobilePane("main");
                  }}
                />
              ) : null}
            </div>

            {(isMobile || rightDesktopOpen) && rightSidebarWidthPx > 0 ? (
              <aside
                className={cn(
                  "min-h-0 overflow-hidden border-l border-border/60 bg-background",
                  isMobile ? "snap-start snap-always" : null,
                )}
                style={{ width: `${rightSidebarWidthPx}px` }}
              >
                <div
                  aria-hidden="true"
                  className="min-h-0 h-full w-full bg-background"
                />
              </aside>
            ) : null}

            {showLeftResizeHandle ? (
              <WorkspaceSidebarResizeHandle
                currentWidthPx={leftSidebarWidthPx}
                dataTestId="workspace-sidebar-left-resize-handle"
                maxWidthPx={leftDesktopResizeRange.maxWidthPx}
                minWidthPx={leftDesktopResizeRange.minWidthPx}
                onWidthChange={(nextWidthPx) => {
                  setLeftDesktopWidthPx(
                    clampWorkspaceDesktopSidebarWidthPx(
                      nextWidthPx,
                      shellWidthPx,
                      rightDesktopOpen ? rightSidebarWidthPx : 0,
                    ),
                  );
                }}
                positionPx={leftSidebarWidthPx}
                side="left"
              />
            ) : null}

            {showRightResizeHandle ? (
              <WorkspaceSidebarResizeHandle
                currentWidthPx={rightSidebarWidthPx}
                dataTestId="workspace-sidebar-right-resize-handle"
                maxWidthPx={rightDesktopResizeRange.maxWidthPx}
                minWidthPx={rightDesktopResizeRange.minWidthPx}
                onWidthChange={(nextWidthPx) => {
                  setRightDesktopWidthPx(
                    clampWorkspaceDesktopSidebarWidthPx(
                      nextWidthPx,
                      shellWidthPx,
                      leftDesktopOpen ? leftSidebarWidthPx : 0,
                    ),
                  );
                }}
                positionPx={shellWidthPx - rightSidebarWidthPx}
                side="right"
              />
            ) : null}
          </div>
        </div>
      </div>
    </WorkspaceMobilePaneDragProvider>
  );
}

/**
 * `/v2/machines` intentionally uses a route-specific shell so we can validate
 * a much smaller mobile model before replacing the shared workspace layout.
 */
export function MachinesWorkspaceV2View(props: MachinesWorkspaceViewProps) {
  return (
    <SidebarProvider
      className="h-full min-h-0"
      defaultOpen={true}
      defaultLeftDesktopWidthPx={288}
      defaultLeftMobileWidthPx={288}
      defaultRightDesktopWidthPx={288}
      defaultRightMobileWidthPx={288}
    >
      <MachinesWorkspaceV2Shell {...props} />
    </SidebarProvider>
  );
}
