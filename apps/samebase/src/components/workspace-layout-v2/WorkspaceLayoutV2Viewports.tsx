import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2LeftPaneMode,
} from "./WorkspaceLayoutV2Geometry";

type WorkspaceLayoutV2ResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

type WorkspaceLayoutV2ViewportStyle = CSSProperties & {
  "--workspace-layout-v2-left-desktop-width": string;
  "--workspace-layout-v2-right-desktop-width": string;
};
type WorkspaceLayoutV2ViewportLeftPaneMode = WorkspaceLayoutV2LeftPaneMode | "absent";

type WorkspaceLayoutV2ViewportProps = WorkspaceLayoutV2ResolvedPaneContent & {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
  carouselRef: RefObject<HTMLDivElement | null>;
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  hasMeasuredViewport: boolean;
  leftWidthPx: number;
  lockCarouselScroll: boolean;
  leftPaneMode: WorkspaceLayoutV2ViewportLeftPaneMode;
  paneWidthPx: number;
  rightWidthPx: number;
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
  leftPaneMode,
  mainContent,
  paneWidthPx,
  rightContent,
  rightWidthPx,
  showRightPane,
}: WorkspaceLayoutV2ViewportProps) {
  const viewportStyle: WorkspaceLayoutV2ViewportStyle = {
    "--workspace-layout-v2-left-desktop-width": `${desktopLeftWidthPx}px`,
    "--workspace-layout-v2-right-desktop-width": `${desktopRightWidthPx}px`,
  };
  const leftPaneWidth = hasMeasuredViewport
    ? `${leftWidthPx}px`
    : "var(--workspace-layout-v2-left-mobile-width, 0px)";
  const mainPaneWidth = hasMeasuredViewport
    ? `${paneWidthPx}px`
    : "var(--workspace-layout-v2-main-mobile-width, 100vw)";
  const rightPaneWidth = hasMeasuredViewport
    ? `${rightWidthPx}px`
    : "var(--workspace-layout-v2-right-mobile-width, 0px)";

  function renderLeftPane() {
    if (leftPaneMode === "absent") {
      return null;
    }

    return (
      <div
        data-workspace-layout-v2-mobile-pane="left"
        data-workspace-layout-v2-mobile-absent={leftPaneMode === "reserved" ? "" : undefined}
        data-workspace-layout-v2-mobile-separator-pane="left"
        data-testid="workspace-layout-v2-pane-left"
        className={cn(
          "workspace-layout-v2-responsive-left-pane relative h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          leftPaneMode === "reserved" ? "hidden md:flex" : "flex",
          "snap-start snap-always",
          leftPaneMode === "reserved"
            ? "md:border-r-0"
            : desktopLeftWidthPx > 0
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

  function renderMainPane() {
    return (
      <div
        data-workspace-layout-v2-mobile-main-pane
        data-workspace-layout-v2-mobile-pane="main"
        className={cn(
          "workspace-layout-v2-responsive-main-pane h-full min-h-0 shrink-0",
          "snap-center snap-always",
        )}
        style={{ width: mainPaneWidth }}
      >
        <div
          data-workspace-layout-v2-mobile-main-pane-surface
          data-workspace-layout-v2-mobile-separator-pane="main"
          className="box-border h-full min-h-0 overflow-hidden bg-background"
        >
          {mainContent}
        </div>
      </div>
    );
  }

  function renderRightPane() {
    if (!showRightPane) {
      return null;
    }

    return (
      <div
        data-workspace-layout-v2-mobile-pane="right"
        data-workspace-layout-v2-mobile-separator-pane="right"
        data-testid="workspace-layout-v2-pane-right"
        className={cn(
          "workspace-layout-v2-responsive-right-pane relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          "snap-end snap-always",
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
      {renderLeftPane()}
      {renderMainPane()}
      {renderRightPane()}
    </div>
  );
}
