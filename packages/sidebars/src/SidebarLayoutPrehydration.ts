import type { SidebarLayoutState } from "./SidebarLayoutState.ts";
import {
  SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MAX_WIDTH_RATIO,
  SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
} from "./SidebarLayoutGeometryInternal.ts";

export type SidebarLayoutPrehydrationState = Pick<
  SidebarLayoutState,
  | "leftDesktopOpen"
  | "leftDesktopWidthPx"
  | "leftMobileWidthPx"
  | "mobilePane"
  | "mobileSurface"
  | "rightDesktopOpen"
  | "rightDesktopWidthPx"
  | "rightMobileWidthPx"
>;

export type SidebarLayoutPrehydrationArgs = {
  desktopStyleElementId: string;
};

type SidebarLayoutPrehydrationInlineArgs = SidebarLayoutPrehydrationArgs & {
  desktopMinWidthPx: number;
  desktopSidebarMaxWidthRatio: number;
  desktopSidebarMinWidthPx: number;
  mobileMainReachableWidthPx: number;
  mobileMainMinWidthPx: number;
  mobileSidebarMinWidthPx: number;
  mobileSidebarMinWidthRatio: number;
};

export type SidebarLayoutPrehydrationStateReader = () => SidebarLayoutPrehydrationState | null;

function getSidebarLayoutPrehydrationInlineArgs(
  args: SidebarLayoutPrehydrationArgs,
): SidebarLayoutPrehydrationInlineArgs {
  return {
    ...args,
    desktopMinWidthPx: SIDEBAR_LAYOUT_DESKTOP_MIN_WIDTH_PX,
    desktopSidebarMaxWidthRatio: SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MAX_WIDTH_RATIO,
    desktopSidebarMinWidthPx: SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    mobileMainReachableWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX,
    mobileMainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
    mobileSidebarMinWidthPx: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    mobileSidebarMinWidthRatio: SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
  };
}

/**
This function is serialized with Function#toString and rendered after the
sidebar layout markup. Keep the body self-contained: it can only reference
browser globals, values passed through args, and helper functions serialized
into the call site.

The script exists because static server markup cannot read consumer pane state.
The initial markup therefore uses default widths and separator state. This
script reads the consumer state before hydration, measures the rendered
carousel, and applies a temporary stylesheet for the first desktop paint. A
closed prehydrated pane must have zero layout width and no structural separator,
so the pane controls do not move when React takes ownership.

The stylesheet targets the server-rendered pane elements directly instead of
writing custom properties on documentElement. The viewport markup has its own
inline desktop-width custom properties, and those element-level properties would
override inherited root values.

The temporary rules use important widths because the server markup contains
inline mobile widths. The measured marker stops these rules as soon as React
owns the rendered geometry.

The script gives its carousel a private scope value so several layouts can use
different consumer state in one document. The selector must also include the
measured-viewport guard. React adds data-viewport-measured after ResizeObserver
reports the viewport size. Once that attribute is present, the temporary
stylesheet no longer matches, and the panes use React's live inline widths for
resizing and normal layout updates.
*/
function InlineScript_prehydrateSidebarLayoutDesktopSidebar(
  args: SidebarLayoutPrehydrationInlineArgs,
  readState: SidebarLayoutPrehydrationStateReader,
) {
  function installPrehydrationStyle({
    carouselNode,
    left,
    right,
  }: {
    carouselNode: Element;
    left: { width: string; open: boolean };
    right: { width: string; open: boolean };
  }) {
    const carouselScopeAttribute = "data-sidebar-layout-desktop-prehydration-scope";
    const styleScopeAttribute = "data-sidebar-layout-desktop-prehydration-style-scope";
    const scopeValue = `sidebar-layout-${encodeURIComponent(args.desktopStyleElementId)}`;
    carouselNode.setAttribute(carouselScopeAttribute, scopeValue);
    // This attribute is the ownership boundary: before measurement, the inline
    // script may correct the first paint; after measurement, React controls the
    // pane widths.
    const viewportSelector = `[data-sidebar-layout-part="carousel"][${carouselScopeAttribute}="${scopeValue}"]:not([data-viewport-measured])`;
    const cssText = `
@media (min-width: ${args.desktopMinWidthPx}px) {
  ${viewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="left"] {
      border-inline-end-width: ${left.open ? 1 : 0}px !important;
      width: ${left.width} !important;
    }

  ${viewportSelector} [data-sidebar-layout-part="pane"][data-pane-side="right"] {
      border-inline-start-width: ${right.open ? 1 : 0}px !important;
      width: ${right.width} !important;
    }
}
`;

    const styleElement = document.createElement("style");
    styleElement.id = args.desktopStyleElementId;
    styleElement.setAttribute(styleScopeAttribute, scopeValue);
    styleElement.textContent = cssText;
    document.head.append(styleElement);
  }

  function findSidebarLayoutCarousel(scriptElement: HTMLScriptElement) {
    let layoutElement = scriptElement.previousElementSibling;
    while (layoutElement !== null) {
      if (layoutElement instanceof window.HTMLElement) {
        if (layoutElement.matches('[data-sidebar-layout-part="carousel"]')) {
          return layoutElement;
        }

        const carouselNode = layoutElement.querySelector('[data-sidebar-layout-part="carousel"]');
        if (carouselNode instanceof window.HTMLElement) {
          return carouselNode;
        }
      }

      layoutElement = layoutElement.previousElementSibling;
    }

    return null;
  }

  function getViewportWidth(carouselNode: Element) {
    const width = Math.round(carouselNode.getBoundingClientRect().width);

    return Number.isFinite(width) && width > 0 ? width : Math.max(1, Math.round(window.innerWidth));
  }

  function readDesktopWidth(open: boolean, width: number, viewportWidthPx: number) {
    if (!open) return "0px";

    const maxWidthPx = Math.max(
      args.desktopSidebarMinWidthPx,
      Math.round(viewportWidthPx * args.desktopSidebarMaxWidthRatio),
    );

    return Math.min(Math.max(args.desktopSidebarMinWidthPx, Math.round(width)), maxWidthPx) + "px";
  }

  try {
    if (window.innerWidth < args.desktopMinWidthPx) return;

    const scriptElement = document.currentScript;
    if (!(scriptElement instanceof window.HTMLScriptElement)) return;

    const carouselNode = findSidebarLayoutCarousel(scriptElement);
    if (carouselNode === null) return;

    const state = readState();
    if (state === null) return;
    if (
      state.mobileSurface.kind === "merged" &&
      state.mobileSurface.mainWidthPx < args.mobileMainMinWidthPx
    ) {
      return;
    }

    const viewportWidthPx = getViewportWidth(carouselNode);
    const leftDesktopWidth = readDesktopWidth(
      state.leftDesktopOpen,
      state.leftDesktopWidthPx,
      viewportWidthPx,
    );
    const rightDesktopWidth = readDesktopWidth(
      state.rightDesktopOpen,
      state.rightDesktopWidthPx,
      viewportWidthPx,
    );

    installPrehydrationStyle({
      carouselNode,
      left: { width: leftDesktopWidth, open: state.leftDesktopOpen },
      right: { width: rightDesktopWidth, open: state.rightDesktopOpen },
    });
  } catch {}
}

/**
This function is serialized with Function#toString and rendered after the
sidebar layout markup. It runs before TanStack's client scripts, when the
carousel DOM exists but React has not hydrated it yet.

Both prehydration scripts run after the sidebar layout markup. Desktop
prehydration measures and scopes its exact carousel. Mobile pane selection
scrolls that native carousel before hydration. Static output can include
framework scripts between the layout root and this script, so the script walks
preceding siblings until it finds the sidebar layout carousel.

Mobile merged and unmerged states share the same pane DOM. Merged state changes
the measured widths, the selected scroll offset, and one root marker attribute;
it does not move nodes before hydration. The root owns the mobile width
variables because React does not write those variables until ResizeObserver has
measured the viewport. That lets this script seed first-paint geometry without a
temporary stylesheet or cleanup observer.
*/
function InlineScript_prehydrateSidebarLayoutMobilePane(
  args: SidebarLayoutPrehydrationInlineArgs,
  readState: SidebarLayoutPrehydrationStateReader,
) {
  function clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function getViewportWidth(carouselNode: Element) {
    const width = Math.round(carouselNode.getBoundingClientRect().width);

    return Number.isFinite(width) && width > 0 ? width : Math.max(1, Math.round(window.innerWidth));
  }

  function getSidebarWidth(storedWidthPx: number, maxWidthPx: number, viewportWidthPx: number) {
    const pageRelativeMinWidthPx = Math.floor(viewportWidthPx * args.mobileSidebarMinWidthRatio);

    return clampNumber(
      Math.round(storedWidthPx),
      Math.max(1, Math.min(args.mobileSidebarMinWidthPx, pageRelativeMinWidthPx, maxWidthPx)),
      maxWidthPx,
    );
  }

  function getAvailableMobilePane({
    hasLeftPane,
    hasRightPane,
    mobilePane,
  }: {
    hasLeftPane: boolean;
    hasRightPane: boolean;
    mobilePane: SidebarLayoutPrehydrationState["mobilePane"];
  }) {
    if (mobilePane === "left" && !hasLeftPane) return "main";
    if (mobilePane === "right" && !hasRightPane) return "main";

    return mobilePane;
  }

  function getMobilePaneScrollLeftPx({
    hasLeftPane,
    leftWidthPx,
    mainWidthPx,
    mobilePane,
    rightWidthPx,
    viewportWidthPx,
  }: {
    hasLeftPane: boolean;
    leftWidthPx: number;
    mainWidthPx: number;
    mobilePane: SidebarLayoutPrehydrationState["mobilePane"];
    rightWidthPx: number;
    viewportWidthPx: number;
  }) {
    if (mobilePane === "left") return 0;
    if (mobilePane === "main") return hasLeftPane ? leftWidthPx : 0;

    return Math.max(
      0,
      (hasLeftPane ? leftWidthPx : 0) + mainWidthPx + rightWidthPx - viewportWidthPx,
    );
  }

  function getMergedMobileSurface({
    canDisplayMergedSurface,
    hasLeftPane,
    hasRightPane,
    leftWidthPx,
    mobilePane,
    rightWidthPx,
    state,
    viewportWidthPx,
  }: {
    canDisplayMergedSurface: boolean;
    hasLeftPane: boolean;
    hasRightPane: boolean;
    leftWidthPx: number;
    mobilePane: SidebarLayoutPrehydrationState["mobilePane"];
    rightWidthPx: number;
    state: SidebarLayoutPrehydrationState;
    viewportWidthPx: number;
  }) {
    if (
      !canDisplayMergedSurface ||
      state.mobileSurface.kind !== "merged" ||
      mobilePane === "main"
    ) {
      return null;
    }

    const mergedSurfaceSide = state.mobileSurface.side;
    const hasMergedPane =
      (mergedSurfaceSide === "left" && hasLeftPane) ||
      (mergedSurfaceSide === "right" && hasRightPane);
    if (!hasMergedPane) return null;

    const mergedSideWidthPx = mergedSurfaceSide === "left" ? leftWidthPx : rightWidthPx;
    // The saved width can come from another device. Fit the first paint to this
    // viewport before React takes ownership of the same local geometry.
    const mergedMainWidthPx = viewportWidthPx - mergedSideWidthPx;
    if (mergedMainWidthPx < args.mobileMainMinWidthPx) return null;

    return {
      mainWidthPx: mergedMainWidthPx,
      side: mergedSurfaceSide,
    };
  }

  function syncMobilePaneRootState({
    leftWidthPx,
    layoutRoot,
    mainWidthPx,
    mergedSurfaceSide,
    mobilePane,
    rightWidthPx,
  }: {
    leftWidthPx: number;
    layoutRoot: HTMLElement;
    mainWidthPx: number;
    mergedSurfaceSide: "left" | "right" | null;
    mobilePane: SidebarLayoutPrehydrationState["mobilePane"];
    rightWidthPx: number;
  }) {
    layoutRoot.setAttribute("data-mobile-pane", mobilePane);
    if (mergedSurfaceSide === null) {
      layoutRoot.removeAttribute("data-sidebar-layout-mobile-merged-side");
    } else {
      layoutRoot.setAttribute("data-sidebar-layout-mobile-merged-side", mergedSurfaceSide);
    }

    const rootStyle = layoutRoot.style;
    rootStyle.setProperty("--sidebar-layout-left-mobile-width", leftWidthPx + "px");
    rootStyle.setProperty("--sidebar-layout-main-mobile-width", mainWidthPx + "px");
    rootStyle.setProperty("--sidebar-layout-right-mobile-width", rightWidthPx + "px");
  }

  function getSidebarLayoutRoot(carouselNode: Element) {
    const layoutRoot = carouselNode.closest('[data-sidebar-layout-part="viewport"]');

    return layoutRoot instanceof window.HTMLElement ? layoutRoot : null;
  }

  function findSidebarLayoutCarousel(scriptElement: HTMLScriptElement) {
    let layoutElement = scriptElement.previousElementSibling;
    while (layoutElement !== null) {
      if (layoutElement instanceof window.HTMLElement) {
        if (layoutElement.matches('[data-sidebar-layout-part="carousel"]')) {
          return layoutElement;
        }

        const carouselNode = layoutElement.querySelector('[data-sidebar-layout-part="carousel"]');
        if (carouselNode instanceof window.HTMLElement) {
          return carouselNode;
        }
      }

      layoutElement = layoutElement.previousElementSibling;
    }

    return null;
  }

  try {
    if (window.innerWidth >= args.desktopMinWidthPx) return;

    const scriptElement = document.currentScript;
    if (!(scriptElement instanceof window.HTMLScriptElement)) return;

    const carouselNode = findSidebarLayoutCarousel(scriptElement);
    if (carouselNode === null) return;
    const layoutRoot = getSidebarLayoutRoot(carouselNode);
    if (layoutRoot === null) return;

    const state = readState();
    if (state === null) return;
    if (
      state.mobileSurface.kind === "merged" &&
      state.mobileSurface.mainWidthPx < args.mobileMainMinWidthPx
    ) {
      return;
    }

    const hasLeftPane =
      carouselNode.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="left"]') !==
      null;
    const hasRightPane =
      carouselNode.querySelector('[data-sidebar-layout-part="pane"][data-pane-side="right"]') !==
      null;
    const mobilePane = getAvailableMobilePane({
      hasLeftPane,
      hasRightPane,
      mobilePane: state.mobilePane,
    });
    const viewportWidthPx = getViewportWidth(carouselNode);
    const defaultMainWidthPx = Math.max(1, viewportWidthPx);
    const sidebarMaxWidthPx = Math.max(
      1,
      Math.floor(viewportWidthPx - args.mobileMainReachableWidthPx),
    );
    const leftWidthPx = hasLeftPane
      ? getSidebarWidth(state.leftMobileWidthPx, sidebarMaxWidthPx, viewportWidthPx)
      : 0;
    const rightWidthPx = hasRightPane
      ? getSidebarWidth(state.rightMobileWidthPx, sidebarMaxWidthPx, viewportWidthPx)
      : 0;
    const mergedSurface = getMergedMobileSurface({
      canDisplayMergedSurface:
        layoutRoot.getAttribute("data-mobile-min-resize-behavior") === "min_resize_to_merge",
      hasLeftPane,
      hasRightPane,
      leftWidthPx,
      mobilePane,
      rightWidthPx,
      state,
      viewportWidthPx,
    });
    const mainWidthPx = mergedSurface === null ? defaultMainWidthPx : mergedSurface.mainWidthPx;
    const mergedSurfaceSide = mergedSurface === null ? null : mergedSurface.side;
    syncMobilePaneRootState({
      leftWidthPx,
      layoutRoot,
      mainWidthPx,
      mergedSurfaceSide,
      mobilePane,
      rightWidthPx,
    });
    carouselNode.scrollLeft = getMobilePaneScrollLeftPx({
      hasLeftPane,
      leftWidthPx,
      mainWidthPx,
      mobilePane,
      rightWidthPx,
      viewportWidthPx,
    });
  } catch {}
}

export function buildSidebarLayoutDesktopPrehydrationScript(
  args: SidebarLayoutPrehydrationArgs,
  readState: SidebarLayoutPrehydrationStateReader,
) {
  return `(${InlineScript_prehydrateSidebarLayoutDesktopSidebar.toString()})(${JSON.stringify(getSidebarLayoutPrehydrationInlineArgs(args))}, ${readState.toString()});`;
}

export function buildSidebarLayoutMobilePanePrehydrationScript(
  args: SidebarLayoutPrehydrationArgs,
  readState: SidebarLayoutPrehydrationStateReader,
) {
  return `(${InlineScript_prehydrateSidebarLayoutMobilePane.toString()})(${JSON.stringify(getSidebarLayoutPrehydrationInlineArgs(args))}, ${readState.toString()});`;
}

export function clearSidebarLayoutDesktopPrehydrationStyle(args: SidebarLayoutPrehydrationArgs) {
  const carouselScopeAttribute = "data-sidebar-layout-desktop-prehydration-scope";
  const styleScopeAttribute = "data-sidebar-layout-desktop-prehydration-style-scope";
  const styleElement = document.getElementById(args.desktopStyleElementId);
  const scopeValue = styleElement?.getAttribute(styleScopeAttribute);
  if (scopeValue) {
    for (const carouselNode of document.querySelectorAll(`[${carouselScopeAttribute}]`)) {
      if (carouselNode.getAttribute(carouselScopeAttribute) === scopeValue) {
        carouselNode.removeAttribute(carouselScopeAttribute);
      }
    }
  }

  styleElement?.remove();
}
