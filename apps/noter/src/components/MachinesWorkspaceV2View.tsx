import * as React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/sidebar";
import {
  MachinesWorkspaceSidebarRail,
  type MachinesWorkspaceViewProps,
} from "@/components/MachinesWorkspaceSidebarRail";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";
import {
  clampWorkspaceDesktopSidebarWidthPx,
  clampWorkspaceMobileSidebarWidthPx,
  getWorkspaceDesktopSidebarWidthRange,
} from "@/lib/workspacePaneSizes";
import { WorkspaceSidebarResizeHandle } from "@/components/workspace-layout/WorkspaceSidebarResizeHandle";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
import { WorkspaceMobilePaneDragProvider } from "@/components/workspace-layout/workspaceMobilePaneDrag";

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

function MachinesWorkspaceV2Shell(props: MachinesWorkspaceViewProps) {
  const {
    isMobile,
    leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane,
    setLeftDesktopWidthPx,
    setMobilePane,
  } = useSidebar();
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const hasInitializedMobileScrollRef = React.useRef(false);
  const snapRestoreFrameRef = React.useRef<number | null>(null);
  const shellWidthPx = useElementWidth(shellRef);
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;
  const resolvedMobilePane = mobilePane === "left" ? "left" : "main";
  const resolvedLeftDesktopSidebarWidthPx =
    leftDesktopOpen && shellWidthPx > 0
      ? clampWorkspaceDesktopSidebarWidthPx(leftDesktopWidthPx, shellWidthPx, 0)
      : leftDesktopOpen
        ? leftDesktopWidthPx
        : 0;
  const resolvedLeftMobileSidebarWidthPx =
    shellWidthPx > 0
      ? clampWorkspaceMobileSidebarWidthPx(leftMobileWidthPx, shellWidthPx)
      : leftMobileWidthPx;
  const leftSidebarWidthPx = isMobile
    ? resolvedLeftMobileSidebarWidthPx
    : resolvedLeftDesktopSidebarWidthPx;
  const desktopResizeRange =
    shellWidthPx > 0
      ? getWorkspaceDesktopSidebarWidthRange(shellWidthPx, 0)
      : null;
  const showLeftResizeHandle =
    !isMobile && leftDesktopOpen && shellWidthPx > 0 && desktopResizeRange;

  const setMobileSnapEnabled = React.useCallback((enabled: boolean) => {
    const scrollNode = shellRef.current;
    const trackNode = trackRef.current;
    const snapType = enabled ? "" : "none";

    if (scrollNode !== null) {
      scrollNode.style.scrollSnapType = snapType;
    }
    if (trackNode !== null) {
      trackNode.style.scrollSnapType = snapType;
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

  const scrollMobilePaneIntoPlace = React.useCallback(
    (behavior: ScrollBehavior) => {
      if (!isMobile) {
        return;
      }

      const scrollNode = shellRef.current;
      if (scrollNode === null) {
        return;
      }

      const targetScrollLeft =
        resolvedMobilePane === "left" ? 0 : leftSidebarWidthPx;
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
    [isMobile, leftSidebarWidthPx, resolvedMobilePane, scheduleSnapRestore],
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

    const nextPane =
      scrollNode.scrollLeft < leftSidebarWidthPx / 2 ? "left" : "main";
    if (nextPane !== resolvedMobilePane) {
      setMobilePane(nextPane);
    }

    const targetScrollLeft = nextPane === "left" ? 0 : leftSidebarWidthPx;
    if (Math.abs(scrollNode.scrollLeft - targetScrollLeft) > 1) {
      scrollNode.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });
    }

    scheduleSnapRestore();
  }, [
    isMobile,
    leftSidebarWidthPx,
    resolvedMobilePane,
    scheduleSnapRestore,
    setMobilePane,
  ]);

  const dragMobileShellBy = React.useCallback(
    (pointerDeltaX: number) => {
      if (!isMobile || leftSidebarWidthPx <= 0) {
        return false;
      }

      const scrollNode = shellRef.current;
      if (scrollNode === null) {
        return false;
      }

      const nextScrollLeft = Math.max(
        0,
        Math.min(leftSidebarWidthPx, scrollNode.scrollLeft - pointerDeltaX),
      );
      if (Math.abs(nextScrollLeft - scrollNode.scrollLeft) <= 0.5) {
        return false;
      }

      setMobileSnapEnabled(false);
      scrollNode.scrollLeft = nextScrollLeft;
      return true;
    },
    [isMobile, leftSidebarWidthPx, setMobileSnapEnabled],
  );

  const mobilePaneDragContextValue = React.useMemo(
    () => ({
      dragMobileShellBy,
      isAvailable: isMobile && leftSidebarWidthPx > 0,
      settleMobileShell,
    }),
    [dragMobileShellBy, isMobile, leftSidebarWidthPx, settleMobileShell],
  );

  React.useEffect(() => {
    if (!isMobile || shellWidthPx <= 0) {
      hasInitializedMobileScrollRef.current = false;
      return;
    }

    const scrollNode = shellRef.current;
    if (scrollNode === null) {
      return;
    }

    if (!hasInitializedMobileScrollRef.current) {
      scrollNode.scrollLeft =
        resolvedMobilePane === "left" ? 0 : leftSidebarWidthPx;
      hasInitializedMobileScrollRef.current = true;
      return;
    }

    scrollMobilePaneIntoPlace("smooth");
  }, [
    isMobile,
    leftSidebarWidthPx,
    resolvedMobilePane,
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

    const handleScroll = () => {
      if (supportsScrollEnd) {
        return;
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
      settleTimeoutId = window.setTimeout(settleMobileShell, 120);
    };

    scrollNode.addEventListener("scroll", handleScroll, { passive: true });
    if (supportsScrollEnd) {
      scrollNode.addEventListener("scrollend", settleMobileShell);
    }

    return () => {
      scrollNode.removeEventListener("scroll", handleScroll);
      if (supportsScrollEnd) {
        scrollNode.removeEventListener("scrollend", settleMobileShell);
      }
      if (settleTimeoutId !== null) {
        window.clearTimeout(settleTimeoutId);
      }
    };
  }, [isMobile, settleMobileShell]);

  React.useEffect(() => {
    return () => {
      if (snapRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(snapRestoreFrameRef.current);
      }
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
        gridTemplateColumns: `${leftSidebarWidthPx}px minmax(0, 1fr)`,
        width: `calc(${leftSidebarWidthPx}px + 100%)`,
      }
    : {
        gridTemplateColumns: leftDesktopOpen
          ? `${leftSidebarWidthPx}px minmax(0, 1fr)`
          : "minmax(0, 1fr)",
      };

  return (
    <WorkspaceMobilePaneDragProvider value={mobilePaneDragContextValue}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div
          ref={shellRef}
          data-testid={props.dataTestId}
          data-mobile-pane={isMobile ? resolvedMobilePane : undefined}
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
                  <div className="flex items-center gap-2">
                    <SidebarTrigger side="left" className="h-8 w-8" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        Machines
                      </div>
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

              {isMobile && resolvedMobilePane === "left" ? (
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

            {showLeftResizeHandle ? (
              <WorkspaceSidebarResizeHandle
                currentWidthPx={leftSidebarWidthPx}
                dataTestId="workspace-sidebar-left-resize-handle"
                maxWidthPx={desktopResizeRange.maxWidthPx}
                minWidthPx={desktopResizeRange.minWidthPx}
                onWidthChange={(nextWidthPx) => {
                  setLeftDesktopWidthPx(nextWidthPx);
                }}
                positionPx={leftSidebarWidthPx}
                side="left"
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
    >
      <MachinesWorkspaceV2Shell {...props} />
    </SidebarProvider>
  );
}
