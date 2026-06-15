import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  type MobilePane,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileMergedSide,
} from "./WorkspaceLayoutV2Geometry";

type WorkspaceLayoutV2ResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

function getMobilePaneSeparatorClass(pane: MobilePane, activePane: MobilePane) {
  if (pane === activePane) {
    return "";
  }

  // Mobile pane ownership can change mid-gesture, but pane geometry must stay
  // exact. A 1px content-box delta can rewrap landing copy and editor text.
  return "workspace-mobile-pane-separators";
}

type WorkspaceLayoutV2ViewportStyle = CSSProperties & {
  "--workspace-layout-v2-left-desktop-width": string;
  "--workspace-layout-v2-right-desktop-width": string;
};

type WorkspaceLayoutV2ViewportProps = WorkspaceLayoutV2ResolvedPaneContent & {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
  carouselRef: RefObject<HTMLDivElement | null>;
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  hasMeasuredViewport: boolean;
  leftWidthPx: number;
  lockCarouselScroll: boolean;
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
  mobilePane: MobilePane;
  paneWidthPx: number;
  peekWidthPx: number;
  rightWidthPx: number;
  showLeftPane: boolean;
  showRightPane: boolean;
};

export function WorkspaceLayoutV2Viewport({
  activeResizeSide,
  carouselRef,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  hasMeasuredViewport,
  leftContent,
  leftWidthPx,
  lockCarouselScroll,
  mainContent,
  mergedSurfaceSide,
  mobilePane,
  paneWidthPx,
  peekWidthPx,
  rightContent,
  rightWidthPx,
  showLeftPane,
  showRightPane,
}: WorkspaceLayoutV2ViewportProps) {
  const viewportStyle: WorkspaceLayoutV2ViewportStyle = {
    "--workspace-layout-v2-left-desktop-width": `${desktopLeftWidthPx}px`,
    "--workspace-layout-v2-right-desktop-width": `${desktopRightWidthPx}px`,
    paddingLeft: `${peekWidthPx}px`,
    paddingRight: `${peekWidthPx}px`,
  };
  // Before ResizeObserver reports a real viewport width, mobile must paint the
  // main pane at full width instead of briefly rendering the 1px numeric floor.
  const leftPaneWidth = hasMeasuredViewport ? `${leftWidthPx}px` : "0px";
  const mainPaneWidth = hasMeasuredViewport ? `${paneWidthPx}px` : "100vw";
  const rightPaneWidth = hasMeasuredViewport ? `${rightWidthPx}px` : "0px";

  function renderLeftPane(shouldSnap: boolean) {
    if (!showLeftPane) {
      return null;
    }

    return (
      <div
        data-testid="workspace-layout-v2-pane-left"
        className={cn(
          "workspace-layout-v2-responsive-left-pane relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          shouldSnap && "snap-start snap-always",
          getMobilePaneSeparatorClass("left", mobilePane),
          desktopLeftWidthPx > 0
            ? activeResizeSide === "left"
              ? "md:border-r md:border-primary"
              : "md:border-r md:border-border"
            : "md:border-r-0",
        )}
        style={{
          width: leftPaneWidth,
        }}
      >
        {leftContent}
      </div>
    );
  }

  function renderMainPane(shouldSnap: boolean) {
    return (
      <div
        data-workspace-layout-v2-mobile-main-pane
        className={cn(
          "workspace-layout-v2-responsive-main-pane h-full min-h-0 shrink-0",
          shouldSnap ? "snap-center snap-always" : "snap-none",
        )}
        style={{ width: mainPaneWidth }}
      >
        <div
          data-workspace-layout-v2-mobile-main-pane-surface
          className={cn(
            "box-border h-full min-h-0 overflow-hidden bg-background",
            getMobilePaneSeparatorClass("main", mobilePane),
          )}
        >
          {mainContent}
        </div>
      </div>
    );
  }

  function renderRightPane(shouldSnap: boolean) {
    if (!showRightPane) {
      return null;
    }

    return (
      <div
        data-testid="workspace-layout-v2-pane-right"
        className={cn(
          "workspace-layout-v2-responsive-right-pane relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          shouldSnap && "snap-end snap-always",
          getMobilePaneSeparatorClass("right", mobilePane),
          desktopRightWidthPx > 0
            ? activeResizeSide === "right"
              ? "md:border-l md:border-primary"
              : "md:border-l md:border-border"
            : "md:border-l-0",
        )}
        style={{
          width: rightPaneWidth,
        }}
      >
        {rightContent}
      </div>
    );
  }

  const mainPane = renderMainPane(mergedSurfaceSide === null);

  return (
    <div
      ref={carouselRef}
      data-testid="workspace-layout-v2-pane-main"
      data-workspace-layout-v2-measured={hasMeasuredViewport ? "" : undefined}
      className={cn(
        "workspace-layout-v2-responsive-viewport absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        lockCarouselScroll ? "overflow-x-hidden" : "overflow-x-auto",
      )}
      style={viewportStyle}
    >
      {mergedSurfaceSide === "left" && showLeftPane ? (
        <div
          data-workspace-layout-v2-mobile-merged-pane="left"
          className={cn(
            "flex h-full min-h-0 shrink-0 snap-start snap-always overflow-hidden bg-background",
          )}
          style={{
            width: hasMeasuredViewport ? `${leftWidthPx + paneWidthPx}px` : "100vw",
          }}
        >
          {renderLeftPane(false)}
          {mainPane}
        </div>
      ) : (
        renderLeftPane(true)
      )}

      {mergedSurfaceSide === null ? mainPane : null}

      {mergedSurfaceSide === "right" && showRightPane ? (
        <div
          data-workspace-layout-v2-mobile-merged-pane="right"
          className={cn(
            "flex h-full min-h-0 shrink-0 snap-end snap-always overflow-hidden bg-background",
          )}
          style={{
            width: hasMeasuredViewport ? `${paneWidthPx + rightWidthPx}px` : "100vw",
          }}
        >
          {mainPane}
          {renderRightPane(false)}
        </div>
      ) : (
        renderRightPane(true)
      )}
    </div>
  );
}
