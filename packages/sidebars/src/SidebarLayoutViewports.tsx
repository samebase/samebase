import { type CSSProperties, type ReactElement, type RefObject } from "react";
import { type SidebarLayoutActiveResizeSide } from "./SidebarLayoutGeometryInternal.ts";

/**
The server HTML has the real pane layout, and the browser may paint it while it parses a long page.
This script runs at the start of each pane, so the carousel is on the pane that the root names
before that paint. The right pane's markup comes last, so when it is the one, the main pane's script
already scrolls to the end: structure.css keeps the right pane's space until it is parsed. After
these scripts, the scroll position is the only record of the pane on screen: hydration reads it.
*/
const INITIAL_PANE_SCRIPT = `(()=>{const pane=document.currentScript.parentElement,carousel=pane.parentElement,target=carousel.parentElement.dataset.mobilePane,side=pane.dataset.paneSide;if(target===side)carousel.scrollLeft=pane.offsetLeft;else if(side==="main"&&target==="right")carousel.scrollLeft=carousel.scrollWidth})()`;

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
  // The mobile widths come from the root's variables until React measures the viewport. On desktop,
  // structure.css sizes the side panes from the root's desktop variables at all times.
  const leftPaneStyle: CSSProperties = {
    width: hasMeasuredViewport
      ? `${leftWidthPx}px`
      : "var(--sidebar-layout-left-mobile-width, 0px)",
  };
  const rightPaneStyle: CSSProperties = {
    width: hasMeasuredViewport
      ? `${rightWidthPx}px`
      : "var(--sidebar-layout-right-mobile-width, 0px)",
  };
  const mainPaneWidth = hasMeasuredViewport
    ? `${paneWidthPx}px`
    : "var(--sidebar-layout-main-mobile-width, 100%)";

  return (
    <div
      ref={carouselRef}
      data-carousel-scroll-locked={lockCarouselScroll ? "" : undefined}
      data-viewport-measured={hasMeasuredViewport ? "" : undefined}
      data-sidebar-layout-part="carousel"
      // The router restores the scroll position of every scroller on a route change and on Back. A
      // pane position is the user's, so a restore would pull them back to an old pane. See the
      // router-core patch in pnpm-workspace.yaml and e2e/mobile-pane-navigation.spec.ts.
      data-scroll-restoration-ignore=""
      suppressHydrationWarning
    >
      {showLeftPane ? (
        <div
          data-active-resize={activeResizeSide === "left" ? "" : undefined}
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
