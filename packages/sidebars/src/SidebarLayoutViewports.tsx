import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { type SidebarLayoutActiveResizeSide } from "./SidebarLayoutGeometryInternal.ts";

/**
The server HTML has the real pane layout, and the browser may paint it while it parses a long page.
This script runs at the start of each pane, so the carousel is on the saved pane before that paint.
After it, the scroll position is the only record of the pane on screen: hydration reads it.
*/
const INITIAL_PANE_SCRIPT = `(()=>{const pane=document.currentScript.parentElement;if(pane.closest('[data-sidebar-layout-part="viewport"]').dataset.mobilePane===pane.dataset.paneSide)pane.parentElement.scrollLeft=pane.offsetLeft})()`;

function InitialPaneScript() {
  return (
    <script dangerouslySetInnerHTML={{ __html: INITIAL_PANE_SCRIPT }} suppressHydrationWarning />
  );
}

type SidebarLayoutResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

type SidebarLayoutLeftPaneStyle = CSSProperties & {
  "--sidebar-layout-left-desktop-width": string;
};

type SidebarLayoutRightPaneStyle = CSSProperties & {
  "--sidebar-layout-right-desktop-width": string;
};

type SidebarLayoutViewportProps = SidebarLayoutResolvedPaneContent & {
  activeResizeSide: SidebarLayoutActiveResizeSide;
  carouselRef: RefObject<HTMLDivElement | null>;
  /** The left pane's desktop width as CSS: pixels once measured, a CSS fit of the saved width before. */
  desktopLeftWidth: string;
  desktopLeftWidthPx: number;
  desktopRightWidth: string;
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
  desktopLeftWidth,
  desktopLeftWidthPx,
  desktopRightWidth,
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
  // Each pane carries its own desktop width variable, so a pane that a render inserts has its width
  // in its first style and the width transition does not animate it from 0.
  const leftPaneStyle: SidebarLayoutLeftPaneStyle = {
    "--sidebar-layout-left-desktop-width": desktopLeftWidth,
    width: hasMeasuredViewport
      ? `${leftWidthPx}px`
      : "var(--sidebar-layout-left-mobile-width, 0px)",
  };
  const rightPaneStyle: SidebarLayoutRightPaneStyle = {
    "--sidebar-layout-right-desktop-width": desktopRightWidth,
    width: hasMeasuredViewport
      ? `${rightWidthPx}px`
      : "var(--sidebar-layout-right-mobile-width, 0px)",
  };
  // The carousel also carries the right pane's desktop width: structure.css keeps that space while
  // the browser has not parsed the right pane's markup yet.
  const carouselStyle: SidebarLayoutRightPaneStyle = {
    "--sidebar-layout-right-desktop-width": desktopRightWidth,
  };
  const mainPaneWidth = hasMeasuredViewport
    ? `${paneWidthPx}px`
    : "var(--sidebar-layout-main-mobile-width, 100%)";

  return (
    <div
      ref={carouselRef}
      data-carousel-scroll-locked={lockCarouselScroll ? "" : undefined}
      data-has-right-pane={showRightPane ? "" : undefined}
      data-viewport-measured={hasMeasuredViewport ? "" : undefined}
      data-sidebar-layout-part="carousel"
      // The router restores the scroll position of every scroller on a route change and on Back. A
      // pane position is the user's, so a restore would pull them back to an old pane. See the
      // router-core patch in pnpm-workspace.yaml and e2e/mobile-pane-navigation.spec.ts.
      data-scroll-restoration-ignore=""
      style={carouselStyle}
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
          style={leftPaneStyle}
        >
          <InitialPaneScript />
          {leftContent}
        </div>
      ) : null}

      <div data-pane-side="main" data-sidebar-layout-part="pane" style={{ width: mainPaneWidth }}>
        <InitialPaneScript />
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
          style={rightPaneStyle}
        >
          <InitialPaneScript />
          {rightContent}
        </div>
      ) : null}
    </div>
  );
}
