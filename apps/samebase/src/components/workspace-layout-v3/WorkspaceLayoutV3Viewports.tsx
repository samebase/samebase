import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { type WorkspaceLayoutV3ActiveResizeSide } from "./WorkspaceLayoutV3Geometry";

type WorkspaceLayoutV3ResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

type WorkspaceLayoutV3ViewportStyle = CSSProperties & {
  "--workspace-layout-v3-left-desktop-width": string;
  "--workspace-layout-v3-right-desktop-width": string;
};

type WorkspaceLayoutV3ViewportProps = WorkspaceLayoutV3ResolvedPaneContent & {
  activeResizeSide: WorkspaceLayoutV3ActiveResizeSide;
  carouselRef: RefObject<HTMLDivElement | null>;
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  hasMeasuredViewport: boolean;
  leftWidthPx: number;
  lockCarouselScroll: boolean;
  paneWidthPx: number;
  rightWidthPx: number;
  showLeftPane: boolean;
  showRightPane: boolean;
};

export function WorkspaceLayoutV3Viewport({
  activeResizeSide,
  carouselRef,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  hasMeasuredViewport,
  leftContent,
  leftWidthPx,
  lockCarouselScroll,
  mainContent,
  paneWidthPx,
  rightContent,
  rightWidthPx,
  showLeftPane,
  showRightPane,
}: WorkspaceLayoutV3ViewportProps) {
  const viewportStyle: WorkspaceLayoutV3ViewportStyle = {
    "--workspace-layout-v3-left-desktop-width": `${desktopLeftWidthPx}px`,
    "--workspace-layout-v3-right-desktop-width": `${desktopRightWidthPx}px`,
  };
  const leftPaneWidth = hasMeasuredViewport
    ? `${leftWidthPx}px`
    : "var(--workspace-layout-v3-left-mobile-width, 0px)";
  const mainPaneWidth = hasMeasuredViewport
    ? `${paneWidthPx}px`
    : "var(--workspace-layout-v3-main-mobile-width, 100vw)";
  const rightPaneWidth = hasMeasuredViewport
    ? `${rightWidthPx}px`
    : "var(--workspace-layout-v3-right-mobile-width, 0px)";

  function renderLeftPane() {
    if (!showLeftPane) {
      return null;
    }

    return (
      <div
        data-workspace-layout-v3-mobile-pane="left"
        data-workspace-layout-v3-mobile-separator-pane="left"
        data-testid="workspace-layout-v3-pane-left"
        className={cn(
          "workspace-layout-v3-responsive-left-pane relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          "snap-start snap-always",
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

  function renderMainPane() {
    return (
      <div
        data-workspace-layout-v3-mobile-main-pane
        data-workspace-layout-v3-mobile-pane="main"
        className={cn(
          "workspace-layout-v3-responsive-main-pane h-full min-h-0 shrink-0",
          "snap-center snap-always",
        )}
        style={{ width: mainPaneWidth }}
      >
        <div
          data-workspace-layout-v3-mobile-main-pane-surface
          data-workspace-layout-v3-mobile-separator-pane="main"
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
        data-workspace-layout-v3-mobile-pane="right"
        data-workspace-layout-v3-mobile-separator-pane="right"
        data-testid="workspace-layout-v3-pane-right"
        className={cn(
          "workspace-layout-v3-responsive-right-pane relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
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
      data-testid="workspace-layout-v3-pane-main"
      data-workspace-layout-v3-measured={hasMeasuredViewport ? "" : undefined}
      className={cn(
        "workspace-layout-v3-responsive-viewport absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
