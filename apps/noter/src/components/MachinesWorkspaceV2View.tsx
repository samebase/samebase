import * as React from "react";
import { SidebarProvider } from "@/components/sidebar";
import {
  MachinesWorkspaceSidebarRail,
  type MachinesWorkspaceViewProps,
} from "@/components/MachinesWorkspaceSidebarRail";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceSidebarResizeHandle } from "@/components/workspace-layout/WorkspaceSidebarResizeHandle";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  readMachinesV2MobileDragOffsetRange,
  readMachinesV2MobilePaneAnchorPx,
  readMachinesV2SettledMobilePane,
} from "@/lib/machinesWorkspaceV2MobileShell";
import {
  MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
  MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
} from "@/lib/workspacePaneSizes";
import { cn } from "@/lib/utils";

const MOBILE_PANE_DRAG_SLOP_PX = 10;

type MachinesV2MobileDragState = {
  lastX: number;
  startX: number;
  startY: number;
  touchIdentifier: number;
  type: "pending" | "shell";
};

function isResizeHandleEventTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest("[data-sidebar-resize-handle]") !== null
  );
}

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

function MachinesWorkspaceV2MobileHeader(props: { dataTestId?: string }) {
  return (
    <div
      data-mobile-header="main"
      data-testid={props.dataTestId}
      className="min-w-0 border-b border-border/50 bg-background"
    >
      <div className="flex items-center gap-3 p-3">
        <span className="truncate text-base font-medium">Machines</span>
      </div>
    </div>
  );
}

function MachinesWorkspaceV2DesktopView(props: MachinesWorkspaceViewProps) {
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;

  return (
    <RepositoryWorkspaceFrame
      clampSidebarWidthsToShell={false}
      dataTestId={props.dataTestId}
      headerTestId={headerTestId}
      contentClassName="min-h-0 flex-1 p-0"
      leftSidebarHeader={null}
      leftSidebarContent={
        <MachinesWorkspaceSidebarRail
          dataTestId={sidebarTestId}
          machineInventories={props.machineInventories}
          selectedMachineId={props.selectedMachineId}
          selectedThreadId={props.selectedThreadId}
          pendingPinThreadKey={props.pendingPinThreadKey}
          relativeTimeReferenceMs={props.relativeTimeReferenceMs}
          onThreadPinChange={props.onThreadPinChange}
          onThreadSelect={({ machineId, threadId }) => {
            props.onThreadSelect?.({ machineId, threadId });
          }}
        />
      }
      rightSidebarHeader={null}
      rightSidebarContent={null}
    >
      <WorkspaceScene
        workspacePaneClassName="bg-background"
        workspaceScrollClassName="overflow-hidden bg-background"
        workspaceBody={
          <MachinesWorkspaceThreadPane
            errorMessage={props.selectedThreadError}
            isLoading={props.selectedThreadLoading}
            isSubmittingTurn={props.isSubmittingTurn}
            mobilePaneDragEnabled
            onTurnDraftChange={props.onTurnDraftChange}
            onTurnSubmit={props.onTurnSubmit}
            selectedMachineDisplayName={props.selectedMachineDisplayName}
            selectedMachineHostname={props.selectedMachineHostname}
            selectedMachineStatusReason={props.selectedMachineStatusReason}
            selectedThreadId={props.selectedThreadId}
            thread={props.selectedThread}
            turnDraft={props.turnDraft}
          />
        }
      />
    </RepositoryWorkspaceFrame>
  );
}

function MachinesWorkspaceV2MobileView(props: MachinesWorkspaceViewProps) {
  const {
    leftMobileWidthPx,
    mobilePane,
    rightMobileWidthPx,
    setLeftMobileWidthPx,
    setMobilePane,
    setRightMobileWidthPx,
  } = useSidebar();
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<MachinesV2MobileDragState | null>(null);
  const isResizingSidebarRef = React.useRef(false);
  const [dragOffsetPxState, setDragOffsetPxState] = React.useState(0);
  const dragOffsetPxRef = React.useRef(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const shellViewportWidthPx = useElementWidth(shellRef);
  const sidebarTestId = props.dataTestId
    ? `${props.dataTestId}-sidebar`
    : undefined;
  const headerTestId = props.dataTestId
    ? `${props.dataTestId}-header`
    : undefined;

  const setDragOffsetPx = React.useCallback((nextOffsetPx: number) => {
    dragOffsetPxRef.current = nextOffsetPx;
    setDragOffsetPxState((currentOffsetPx) =>
      currentOffsetPx === nextOffsetPx ? currentOffsetPx : nextOffsetPx,
    );
  }, []);

  const dragMobileShellBy = React.useCallback(
    (pointerDeltaX: number) => {
      const { maxOffsetPx, minOffsetPx } = readMachinesV2MobileDragOffsetRange({
        currentPane: mobilePane,
        leftSidebarWidthPx: leftMobileWidthPx,
        rightSidebarWidthPx: rightMobileWidthPx,
      });
      const nextOffsetPx = Math.max(
        minOffsetPx,
        Math.min(maxOffsetPx, dragOffsetPxRef.current + pointerDeltaX),
      );

      if (Math.abs(nextOffsetPx - dragOffsetPxRef.current) <= 0.5) {
        return false;
      }

      setDragOffsetPx(nextOffsetPx);
      return true;
    },
    [leftMobileWidthPx, mobilePane, rightMobileWidthPx, setDragOffsetPx],
  );

  const settleMobileShell = React.useCallback(() => {
    const nextPane = readMachinesV2SettledMobilePane({
      currentPane: mobilePane,
      dragOffsetPx: dragOffsetPxRef.current,
      leftSidebarWidthPx: leftMobileWidthPx,
      rightSidebarWidthPx: rightMobileWidthPx,
    });

    setIsDragging(false);
    setDragOffsetPx(0);
    if (nextPane !== mobilePane) {
      setMobilePane(nextPane);
    }
  }, [
    leftMobileWidthPx,
    mobilePane,
    rightMobileWidthPx,
    setDragOffsetPx,
    setMobilePane,
  ]);

  React.useEffect(() => {
    setDragOffsetPx(0);
    setIsDragging(false);
  }, [mobilePane, setDragOffsetPx]);

  const handleSidebarResizeStart = React.useCallback(() => {
    // Resizing a sidebar edge must not also seed a pane swipe gesture.
    isResizingSidebarRef.current = true;
    dragStateRef.current = null;
    setIsDragging(false);
    setDragOffsetPx(0);
  }, [setDragOffsetPx]);

  const handleSidebarResizeEnd = React.useCallback(() => {
    isResizingSidebarRef.current = false;
  }, []);

  React.useEffect(() => {
    const shellNode = shellRef.current;
    if (shellNode === null) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (
        isResizingSidebarRef.current ||
        isResizeHandleEventTarget(event.target)
      ) {
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }

      if (event.touches.length !== 1) {
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }

      const touch = event.touches.item(0);
      if (touch === null) {
        return;
      }

      dragStateRef.current = {
        lastX: touch.clientX,
        startX: touch.clientX,
        startY: touch.clientY,
        touchIdentifier: touch.identifier,
        type: "pending",
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (isResizingSidebarRef.current) {
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }

      const dragState = dragStateRef.current;
      if (dragState === null) {
        return;
      }

      const touch = findTouchByIdentifier(
        event.touches,
        dragState.touchIdentifier,
      );
      if (touch === null) {
        return;
      }

      if (dragState.type === "pending") {
        const dx = touch.clientX - dragState.startX;
        const dy = touch.clientY - dragState.startY;
        if (
          Math.abs(dx) < MOBILE_PANE_DRAG_SLOP_PX &&
          Math.abs(dy) < MOBILE_PANE_DRAG_SLOP_PX
        ) {
          return;
        }

        if (Math.abs(dx) <= Math.abs(dy)) {
          dragStateRef.current = null;
          setIsDragging(false);
          return;
        }
      }

      const deltaX = touch.clientX - dragState.lastX;
      dragState.lastX = touch.clientX;
      if (deltaX === 0) {
        return;
      }

      const didMoveShell = dragMobileShellBy(deltaX);
      if (!didMoveShell) {
        return;
      }

      dragState.type = "shell";
      setIsDragging(true);
      event.preventDefault();
      event.stopPropagation();
    };

    const finishTouchGesture = (event: TouchEvent) => {
      if (isResizingSidebarRef.current) {
        dragStateRef.current = null;
        setIsDragging(false);
        return;
      }

      const dragState = dragStateRef.current;
      if (dragState === null) {
        return;
      }

      dragStateRef.current = null;
      if (dragState.type !== "shell") {
        setIsDragging(false);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      settleMobileShell();
    };

    shellNode.addEventListener("touchstart", handleTouchStart, {
      capture: true,
      passive: false,
    });
    shellNode.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: false,
    });
    shellNode.addEventListener("touchend", finishTouchGesture, {
      capture: true,
      passive: false,
    });
    shellNode.addEventListener("touchcancel", finishTouchGesture, {
      capture: true,
      passive: false,
    });

    return () => {
      shellNode.removeEventListener("touchstart", handleTouchStart, true);
      shellNode.removeEventListener("touchmove", handleTouchMove, true);
      shellNode.removeEventListener("touchend", finishTouchGesture, true);
      shellNode.removeEventListener("touchcancel", finishTouchGesture, true);
    };
  }, [dragMobileShellBy, settleMobileShell]);

  const trackOffsetPx =
    readMachinesV2MobilePaneAnchorPx({
      leftSidebarWidthPx: leftMobileWidthPx,
      pane: mobilePane,
      rightSidebarWidthPx: rightMobileWidthPx,
    }) - dragOffsetPxState;
  const trackStyle: React.CSSProperties & {
    "--workspace-left-sidebar-width": string;
    "--workspace-right-sidebar-width": string;
  } = {
    gridTemplateColumns:
      "var(--workspace-left-sidebar-width) minmax(0, 1fr) var(--workspace-right-sidebar-width)",
    transform: `translate3d(${-trackOffsetPx}px, 0, 0)`,
    transition: isDragging ? "none" : "transform 200ms ease-out",
    width:
      "calc(100% + var(--workspace-left-sidebar-width) + var(--workspace-right-sidebar-width))",
    "--workspace-left-sidebar-width": `${leftMobileWidthPx}px`,
    "--workspace-right-sidebar-width": `${rightMobileWidthPx}px`,
  };
  const sidebarCellClassName =
    "min-w-0 overflow-hidden bg-background transition-[border-color] duration-200 ease-linear";
  const showLeftResizeHandle =
    mobilePane === "left" && leftMobileWidthPx > 0 && shellViewportWidthPx > 0;
  const showRightResizeHandle =
    mobilePane === "right" &&
    rightMobileWidthPx > 0 &&
    shellViewportWidthPx > 0;

  return (
    <div
      ref={shellRef}
      data-testid={props.dataTestId}
      data-mobile-pane={mobilePane}
      data-sidebar-shell="v2-mobile"
      className="relative flex h-full w-full min-h-0 flex-col overflow-hidden"
      style={{ touchAction: "pan-y" }}
    >
      <MachinesWorkspaceV2MobileHeader dataTestId={headerTestId} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          data-sidebar-track="v2-mobile"
          className="relative grid h-full min-h-0"
          style={trackStyle}
        >
          <div
            className={cn(
              sidebarCellClassName,
              "min-h-0 border-r border-border/50",
            )}
          >
            <MachinesWorkspaceSidebarRail
              dataTestId={sidebarTestId}
              machineInventories={props.machineInventories}
              selectedMachineId={props.selectedMachineId}
              selectedThreadId={props.selectedThreadId}
              pendingPinThreadKey={props.pendingPinThreadKey}
              relativeTimeReferenceMs={props.relativeTimeReferenceMs}
              onThreadPinChange={props.onThreadPinChange}
              onThreadSelect={({ machineId, threadId }) => {
                setMobilePane("main");
                props.onThreadSelect?.({ machineId, threadId });
              }}
            />
          </div>

          <div
            data-testid={
              props.dataTestId
                ? `${props.dataTestId}-mobile-main-pane`
                : undefined
            }
            className="col-start-2 min-h-0 min-w-0 bg-background"
          >
            <WorkspaceScene
              workspacePaneClassName="bg-background"
              workspaceScrollClassName="overflow-hidden bg-background"
              workspaceBody={
                <MachinesWorkspaceThreadPane
                  errorMessage={props.selectedThreadError}
                  isLoading={props.selectedThreadLoading}
                  isSubmittingTurn={props.isSubmittingTurn}
                  mobilePaneDragEnabled
                  onTurnDraftChange={props.onTurnDraftChange}
                  onTurnSubmit={props.onTurnSubmit}
                  selectedMachineDisplayName={props.selectedMachineDisplayName}
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

          <div
            className={cn(
              sidebarCellClassName,
              "col-start-3 min-h-0 border-l border-border/50",
            )}
          >
            <div aria-hidden="true" className="min-h-0 h-full bg-background" />
          </div>
        </div>

        {showLeftResizeHandle ? (
          <WorkspaceSidebarResizeHandle
            currentWidthPx={leftMobileWidthPx}
            dataTestId="machines-v2-mobile-left-resize-handle"
            maxWidthPx={MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX}
            minWidthPx={MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX}
            onResizeEnd={handleSidebarResizeEnd}
            onResizeStart={handleSidebarResizeStart}
            onWidthChange={setLeftMobileWidthPx}
            positionPx={leftMobileWidthPx}
            side="left"
          />
        ) : null}

        {showRightResizeHandle ? (
          <WorkspaceSidebarResizeHandle
            currentWidthPx={rightMobileWidthPx}
            dataTestId="machines-v2-mobile-right-resize-handle"
            maxWidthPx={MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX}
            minWidthPx={MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX}
            onResizeEnd={handleSidebarResizeEnd}
            onResizeStart={handleSidebarResizeStart}
            onWidthChange={setRightMobileWidthPx}
            positionPx={shellViewportWidthPx - rightMobileWidthPx}
            side="right"
          />
        ) : null}
      </div>
    </div>
  );
}

function MachinesWorkspaceV2ViewContent(props: MachinesWorkspaceViewProps) {
  const { isMobile } = useSidebar();

  if (isMobile) {
    return <MachinesWorkspaceV2MobileView {...props} />;
  }

  return <MachinesWorkspaceV2DesktopView {...props} />;
}

/**
 * Functional requirements for `/v2/machines` mobile:
 * - the shell always has three pane slots: left, main, and right
 * - the shell has one persistent top header outside the translated panes
 * - mobile does not render sidebar trigger buttons; sidebars open/close by drag
 * - the shell must not add a scrim or click-capture overlay to dismiss sidebars
 * - visible mobile sidebars expose draggable resize edges on both the left and
 *   right pane variants, and resizing those edges must not also swipe the pane
 * - swipe settling is adjacent-only: left <-> main <-> right
 * - configured mobile sidebar widths are used as-is and are not clamped to the
 *   current browser width
 */
export function MachinesWorkspaceV2View(props: MachinesWorkspaceViewProps) {
  return (
    <SidebarProvider
      className="h-full min-h-0"
      defaultOpen={true}
      defaultRightOpen={true}
      defaultLeftDesktopWidthPx={288}
      defaultLeftMobileWidthPx={288}
      defaultRightDesktopWidthPx={288}
      defaultRightMobileWidthPx={288}
    >
      <MachinesWorkspaceV2ViewContent {...props} />
    </SidebarProvider>
  );
}
