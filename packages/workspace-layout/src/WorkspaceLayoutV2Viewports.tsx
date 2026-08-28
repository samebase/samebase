import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { type WorkspaceLayoutV2ActiveResizeSide } from "./WorkspaceLayoutV2Geometry.ts";

type WorkspaceLayoutV2ResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

type WorkspaceLayoutV2ViewportStyle = CSSProperties & {
  "--workspace-layout-v2-left-desktop-width": string;
  "--workspace-layout-v2-right-desktop-width": string;
};

type WorkspaceLayoutV2ViewportProps = WorkspaceLayoutV2ResolvedPaneContent & {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
  carouselRef: RefObject<HTMLDivElement | null>;
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  enableDesktopPaneTransitions: boolean;
  hasMeasuredViewport: boolean;
  leftWidthPx: number;
  lockCarouselScroll: boolean;
  paneWidthPx: number;
  rightWidthPx: number;
  showLeftPane: boolean;
  showRightPane: boolean;
};

export function WorkspaceLayoutV2Viewport({
  activeResizeSide,
  carouselRef,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  enableDesktopPaneTransitions,
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

  return (
    <div
      ref={carouselRef}
      data-carousel-scroll-locked={lockCarouselScroll ? "" : undefined}
      data-testid="workspace-layout-v2-pane-main"
      data-viewport-measured={hasMeasuredViewport ? "" : undefined}
      data-workspace-layout-part="carousel"
      data-workspace-layout-v2-measured={hasMeasuredViewport ? "" : undefined}
      style={viewportStyle}
    >
      {showLeftPane ? (
        <div
          data-active-resize={activeResizeSide === "left" ? "" : undefined}
          data-desktop-open={desktopLeftWidthPx > 0 ? "" : undefined}
          data-pane-side="left"
          data-transition-enabled={enableDesktopPaneTransitions ? "" : undefined}
          data-workspace-layout-part="pane"
          data-workspace-layout-v2-mobile-pane="left"
          data-workspace-layout-v2-mobile-separator-pane="left"
          data-testid="workspace-layout-v2-pane-left"
          style={{ width: leftPaneWidth }}
        >
          {leftContent}
        </div>
      ) : null}

      <div
        data-pane-side="main"
        data-workspace-layout-part="pane"
        data-workspace-layout-v2-mobile-main-pane
        data-workspace-layout-v2-mobile-pane="main"
        style={{ width: mainPaneWidth }}
      >
        <div
          data-workspace-layout-part="pane-surface"
          data-workspace-layout-v2-mobile-main-pane-surface
          data-workspace-layout-v2-mobile-separator-pane="main"
        >
          {mainContent}
        </div>
      </div>

      {showRightPane ? (
        <div
          data-active-resize={activeResizeSide === "right" ? "" : undefined}
          data-desktop-open={desktopRightWidthPx > 0 ? "" : undefined}
          data-pane-side="right"
          data-transition-enabled={enableDesktopPaneTransitions ? "" : undefined}
          data-workspace-layout-part="pane"
          data-workspace-layout-v2-mobile-pane="right"
          data-workspace-layout-v2-mobile-separator-pane="right"
          data-testid="workspace-layout-v2-pane-right"
          style={{ width: rightPaneWidth }}
        >
          {rightContent}
        </div>
      ) : null}
    </div>
  );
}
