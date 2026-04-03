import * as React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/sidebar";
import {
  MachinesWorkspaceSidebarRail,
  type MachinesWorkspaceViewProps,
} from "@/components/MachinesWorkspaceSidebarRail";
import { MachinesWorkspaceThreadPane } from "@/components/MachinesWorkspaceThreadPane";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";
import { WorkspaceScene } from "@/components/workspace-layout/WorkspaceScene";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  readMachinesV2MobileDragOffsetRange,
  readMachinesV2MobilePaneAnchorPx,
  readMachinesV2SettledMobilePane,
} from "@/lib/machinesWorkspaceV2MobileShell";
import { cn } from "@/lib/utils";

const MOBILE_PANE_DRAG_SLOP_PX = 10;

type MachinesV2MobileDragState = {
  lastX: number;
  startX: number;
  startY: number;
  touchIdentifier: number;
  type: "pending" | "shell";
};

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
  const { leftMobileWidthPx, mobilePane, rightMobileWidthPx, setMobilePane } =
    useSidebar();
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const dragStateRef = React.useRef<MachinesV2MobileDragState | null>(null);
  const [dragOffsetPxState, setDragOffsetPxState] = React.useState(0);
  const dragOffsetPxRef = React.useRef(0);
  const [isDragging, setIsDragging] = React.useState(false);
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

  React.useEffect(() => {
    const shellNode = shellRef.current;
    if (shellNode === null) {
      return;
    }

    const handleTouchStart = (event: TouchEvent) => {
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

  const handleMainPaneClickCapture = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (mobilePane === "main") {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest('[data-sidebar="trigger"]') !== null
      ) {
        return;
      }

      setMobilePane("main");
    },
    [mobilePane, setMobilePane],
  );

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
    gridTemplateRows: "auto minmax(0, 1fr)",
    transform: `translate3d(${-trackOffsetPx}px, 0, 0)`,
    transition: isDragging ? "none" : "transform 200ms ease-out",
    width:
      "calc(100% + var(--workspace-left-sidebar-width) + var(--workspace-right-sidebar-width))",
    "--workspace-left-sidebar-width": `${leftMobileWidthPx}px`,
    "--workspace-right-sidebar-width": `${rightMobileWidthPx}px`,
  };
  const sidebarCellClassName =
    "min-w-0 overflow-hidden bg-background transition-[border-color] duration-200 ease-linear";
  const emptySidebarHeaderClassName =
    "h-full min-h-0 border-b border-border/50 bg-background";

  return (
    <div
      ref={shellRef}
      data-testid={props.dataTestId}
      data-mobile-pane={mobilePane}
      data-sidebar-shell="v2-mobile"
      className="relative h-full w-full min-h-0 overflow-hidden"
      style={{ touchAction: "pan-y" }}
    >
      <div
        data-sidebar-track="v2-mobile"
        className="relative grid h-full min-h-0"
        style={trackStyle}
      >
        <div className={cn(sidebarCellClassName, "border-r border-border/50")}>
          <div className={emptySidebarHeaderClassName} />
        </div>

        <div
          data-testid={headerTestId}
          onClickCapture={handleMainPaneClickCapture}
          className="col-start-2 row-start-1 min-w-0 border-b border-border/50 bg-background"
        >
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8" side="left" />
              <span className="truncate text-base font-medium">Machines</span>
            </div>
            <SidebarTrigger className="h-8 w-8" side="right" />
          </div>
        </div>

        <div
          className={cn(
            sidebarCellClassName,
            "col-start-3 border-l border-border/50",
          )}
        >
          <div className={emptySidebarHeaderClassName} />
        </div>

        <div
          className={cn(
            sidebarCellClassName,
            "row-start-2 border-r border-border/50",
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
          onClickCapture={handleMainPaneClickCapture}
          className="col-start-2 row-start-2 min-h-0 min-w-0 bg-background"
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
        </div>

        <div
          className={cn(
            sidebarCellClassName,
            "col-start-3 row-start-2 border-l border-border/50",
          )}
        >
          <div aria-hidden="true" className="min-h-0 h-full bg-background" />
        </div>
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
 * `/v2/machines` keeps the existing desktop frame, but mobile now uses a
 * route-owned pane shell with explicit pane state and drag offset instead of
 * the shared carousel/scroll orchestration.
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
