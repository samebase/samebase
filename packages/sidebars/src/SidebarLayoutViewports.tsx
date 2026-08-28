import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { type SidebarLayoutActiveResizeSide } from "./SidebarLayoutGeometryInternal.ts";

type SidebarLayoutResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

type SidebarLayoutViewportStyle = CSSProperties & {
  "--sidebar-layout-left-desktop-width": string;
  "--sidebar-layout-right-desktop-width": string;
};

type SidebarLayoutViewportProps = SidebarLayoutResolvedPaneContent & {
  activeResizeSide: SidebarLayoutActiveResizeSide;
  carouselRef: RefObject<HTMLDivElement | null>;
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  enableDesktopPaneTransitions: boolean;
  hasMeasuredViewport: boolean;
  inertClosedDesktopPanes: boolean;
  leftPaneId: string;
  leftWidthPx: number;
  lockCarouselScroll: boolean;
  paneWidthPx: number;
  rightWidthPx: number;
  rightPaneId: string;
  showLeftPane: boolean;
  showRightPane: boolean;
};

export function SidebarLayoutViewport({
  activeResizeSide,
  carouselRef,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  enableDesktopPaneTransitions,
  hasMeasuredViewport,
  inertClosedDesktopPanes,
  leftContent,
  leftPaneId,
  leftWidthPx,
  lockCarouselScroll,
  mainContent,
  paneWidthPx,
  rightContent,
  rightPaneId,
  rightWidthPx,
  showLeftPane,
  showRightPane,
}: SidebarLayoutViewportProps) {
  const viewportStyle: SidebarLayoutViewportStyle = {
    "--sidebar-layout-left-desktop-width": `${desktopLeftWidthPx}px`,
    "--sidebar-layout-right-desktop-width": `${desktopRightWidthPx}px`,
  };
  const leftPaneWidth = hasMeasuredViewport
    ? `${leftWidthPx}px`
    : "var(--sidebar-layout-left-mobile-width, 0px)";
  const mainPaneWidth = hasMeasuredViewport
    ? `${paneWidthPx}px`
    : "var(--sidebar-layout-main-mobile-width, 100%)";
  const rightPaneWidth = hasMeasuredViewport
    ? `${rightWidthPx}px`
    : "var(--sidebar-layout-right-mobile-width, 0px)";

  return (
    <div
      ref={carouselRef}
      data-carousel-scroll-locked={lockCarouselScroll ? "" : undefined}
      data-viewport-measured={hasMeasuredViewport ? "" : undefined}
      data-sidebar-layout-part="carousel"
      style={viewportStyle}
      suppressHydrationWarning
    >
      {showLeftPane ? (
        <div
          data-active-resize={activeResizeSide === "left" ? "" : undefined}
          data-desktop-open={desktopLeftWidthPx > 0 ? "" : undefined}
          data-pane-side="left"
          data-transition-enabled={enableDesktopPaneTransitions ? "" : undefined}
          data-sidebar-layout-part="pane"
          id={leftPaneId}
          inert={inertClosedDesktopPanes && desktopLeftWidthPx === 0 ? true : undefined}
          style={{ width: leftPaneWidth }}
        >
          {leftContent}
        </div>
      ) : null}

      <div data-pane-side="main" data-sidebar-layout-part="pane" style={{ width: mainPaneWidth }}>
        <div data-sidebar-layout-part="pane-surface">{mainContent}</div>
      </div>

      {showRightPane ? (
        <div
          data-active-resize={activeResizeSide === "right" ? "" : undefined}
          data-desktop-open={desktopRightWidthPx > 0 ? "" : undefined}
          data-pane-side="right"
          data-transition-enabled={enableDesktopPaneTransitions ? "" : undefined}
          data-sidebar-layout-part="pane"
          id={rightPaneId}
          inert={inertClosedDesktopPanes && desktopRightWidthPx === 0 ? true : undefined}
          style={{ width: rightPaneWidth }}
        >
          {rightContent}
        </div>
      ) : null}
    </div>
  );
}
