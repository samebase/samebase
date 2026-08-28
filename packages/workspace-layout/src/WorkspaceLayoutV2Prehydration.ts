import type { WorkspaceSidebarState } from "./WorkspaceLayoutV2State.ts";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_PEEK_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
} from "./WorkspaceLayoutV2Geometry.ts";

export type WorkspaceLayoutV2PrehydrationState = Pick<
  WorkspaceSidebarState,
  | "leftDesktopOpen"
  | "leftDesktopWidthPx"
  | "leftMobileWidthPx"
  | "mobilePane"
  | "mobileSurface"
  | "rightDesktopOpen"
  | "rightDesktopWidthPx"
  | "rightMobileWidthPx"
>;

export type WorkspaceLayoutV2PrehydrationArgs = {
  desktopStyleElementId: string;
};

type WorkspaceLayoutV2PrehydrationInlineArgs = WorkspaceLayoutV2PrehydrationArgs & {
  desktopMinWidthPx: number;
  desktopSidebarMinWidthPx: number;
  mobileMainReachableWidthPx: number;
  mobileMainMinWidthPx: number;
  mobileSidebarMinWidthPx: number;
  mobileSidebarMinWidthRatio: number;
};

export type WorkspaceLayoutV2PrehydrationStateReader =
  () => WorkspaceLayoutV2PrehydrationState | null;

function getWorkspaceLayoutV2PrehydrationInlineArgs(
  args: WorkspaceLayoutV2PrehydrationArgs,
): WorkspaceLayoutV2PrehydrationInlineArgs {
  return {
    ...args,
    desktopMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_MIN_WIDTH_PX,
    desktopSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    mobileMainReachableWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_PEEK_WIDTH_PX,
    mobileMainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
    mobileSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
    mobileSidebarMinWidthRatio: WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
  };
}

/**
This function is serialized with Function#toString and emitted as a classic
inline head script before React hydration. Keep the body self-contained: it can
only reference browser globals, values passed through args, and helper functions
serialized into the call site.

The script exists because static server markup cannot read consumer pane state.
The initial markup therefore uses default widths and separator state. This
script reads the consumer state before hydration and applies a temporary
stylesheet for the first desktop paint. A closed prehydrated pane must have zero
layout width and no structural separator, so the pane controls do not move when
React takes ownership.

The stylesheet targets the server-rendered pane elements directly instead of
writing custom properties on documentElement. The viewport markup has its own
inline desktop-width custom properties, and those element-level properties would
override inherited root values.

The temporary rules use important widths because the server markup contains
inline mobile widths. The measured marker stops these rules as soon as React
owns the rendered geometry.

The selector must include the measured-viewport guard. React adds
data-viewport-measured after ResizeObserver reports the viewport size. Once
that attribute is present, the temporary stylesheet no longer
matches, and the panes use React's live inline widths for resizing and normal
layout updates.
*/
function InlineScript_prehydrateWorkspaceLayoutV2DesktopSidebar(
  args: WorkspaceLayoutV2PrehydrationInlineArgs,
  readState: WorkspaceLayoutV2PrehydrationStateReader,
) {
  function installPrehydrationStyle({
    left,
    right,
  }: {
    left: { width: string; open: boolean };
    right: { width: string; open: boolean };
  }) {
    // This attribute is the ownership boundary: before measurement, the head
    // script may correct the first paint; after measurement, React controls the
    // pane widths.
    const viewportSelector =
      '[data-workspace-layout-part="carousel"]:not([data-viewport-measured])';
    const leftDesktopSeparatorRule = left.open
      ? ""
      : `${viewportSelector} [data-workspace-layout-part="pane"][data-pane-side="left"]::after {
      content: none !important;
    }`;
    const rightDesktopSeparatorRule = right.open
      ? ""
      : `${viewportSelector} [data-workspace-layout-part="pane"][data-pane-side="right"]::before {
      content: none !important;
    }`;
    const cssText = `
@media (min-width: ${args.desktopMinWidthPx}px) {
  ${viewportSelector} [data-workspace-layout-part="pane"][data-pane-side="left"] {
      width: ${left.width} !important;
    }

  ${viewportSelector} [data-workspace-layout-part="pane"][data-pane-side="right"] {
      width: ${right.width} !important;
    }

  ${leftDesktopSeparatorRule}
  ${rightDesktopSeparatorRule}
}
`;

    const styleElement = document.createElement("style");
    styleElement.id = args.desktopStyleElementId;
    styleElement.textContent = cssText;
    document.head.append(styleElement);
  }

  function readDesktopWidth(open: boolean, width: number) {
    if (!open) return "0px";

    return Math.max(args.desktopSidebarMinWidthPx, Math.round(width)) + "px";
  }

  try {
    const state = readState();
    if (state === null) return;

    const leftDesktopWidth = readDesktopWidth(state.leftDesktopOpen, state.leftDesktopWidthPx);
    const rightDesktopWidth = readDesktopWidth(state.rightDesktopOpen, state.rightDesktopWidthPx);

    installPrehydrationStyle({
      left: { width: leftDesktopWidth, open: state.leftDesktopOpen },
      right: { width: rightDesktopWidth, open: state.rightDesktopOpen },
    });
  } catch {}
}

/**
This function is serialized with Function#toString and rendered after the
workspace layout markup. It runs before TanStack's client scripts, when the
carousel DOM exists but React has not hydrated it yet.

Desktop prehydration can live in the document head because it only installs CSS
for future elements. Mobile pane selection must run after the workspace layout
markup because it scrolls the native carousel that already exists in the SSG
HTML. Static output can include framework scripts between the layout root and
this script, so the script walks preceding siblings until it finds the workspace
carousel.

Mobile merged and unmerged states share the same pane DOM. Merged state changes
the measured widths, the selected scroll offset, and one root marker attribute;
it does not move nodes before hydration. The root owns the mobile width
variables because React does not write those variables until ResizeObserver has
measured the viewport. That lets this script seed first-paint geometry without a
temporary stylesheet or cleanup observer.
*/
function InlineScript_prehydrateWorkspaceLayoutV2MobilePane(
  args: WorkspaceLayoutV2PrehydrationInlineArgs,
  readState: WorkspaceLayoutV2PrehydrationStateReader,
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
    mobilePane: WorkspaceLayoutV2PrehydrationState["mobilePane"];
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
    mobilePane: WorkspaceLayoutV2PrehydrationState["mobilePane"];
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
    hasLeftPane,
    hasRightPane,
    leftWidthPx,
    mobilePane,
    rightWidthPx,
    state,
    viewportWidthPx,
  }: {
    hasLeftPane: boolean;
    hasRightPane: boolean;
    leftWidthPx: number;
    mobilePane: WorkspaceLayoutV2PrehydrationState["mobilePane"];
    rightWidthPx: number;
    state: WorkspaceLayoutV2PrehydrationState;
    viewportWidthPx: number;
  }) {
    if (state.mobileSurface.kind !== "merged" || mobilePane === "main") return null;

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
    mobilePane: WorkspaceLayoutV2PrehydrationState["mobilePane"];
    rightWidthPx: number;
  }) {
    layoutRoot.setAttribute("data-mobile-pane", mobilePane);
    if (mergedSurfaceSide === null) {
      layoutRoot.removeAttribute("data-workspace-layout-v2-mobile-merged-side");
    } else {
      layoutRoot.setAttribute("data-workspace-layout-v2-mobile-merged-side", mergedSurfaceSide);
    }

    const rootStyle = layoutRoot.style;
    rootStyle.setProperty("--workspace-layout-v2-left-mobile-width", leftWidthPx + "px");
    rootStyle.setProperty("--workspace-layout-v2-main-mobile-width", mainWidthPx + "px");
    rootStyle.setProperty("--workspace-layout-v2-right-mobile-width", rightWidthPx + "px");
  }

  function getWorkspaceLayoutRoot(carouselNode: Element) {
    const layoutRoot = carouselNode.closest('[data-workspace-layout-part="viewport"]');

    return layoutRoot instanceof window.HTMLElement ? layoutRoot : null;
  }

  function findWorkspaceLayoutCarousel(scriptElement: HTMLScriptElement) {
    let layoutElement = scriptElement.previousElementSibling;
    while (layoutElement !== null) {
      if (layoutElement instanceof window.HTMLElement) {
        if (layoutElement.matches('[data-workspace-layout-part="carousel"]')) {
          return layoutElement;
        }

        const carouselNode = layoutElement.querySelector('[data-workspace-layout-part="carousel"]');
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

    const carouselNode = findWorkspaceLayoutCarousel(scriptElement);
    if (carouselNode === null) return;
    const layoutRoot = getWorkspaceLayoutRoot(carouselNode);
    if (layoutRoot === null) return;

    const state = readState();
    if (state === null) return;

    const hasLeftPane =
      carouselNode.querySelector('[data-workspace-layout-part="pane"][data-pane-side="left"]') !==
      null;
    const hasRightPane =
      carouselNode.querySelector('[data-workspace-layout-part="pane"][data-pane-side="right"]') !==
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

export function buildWorkspaceLayoutV2DesktopPrehydrationScript(
  args: WorkspaceLayoutV2PrehydrationArgs,
  readState: WorkspaceLayoutV2PrehydrationStateReader,
) {
  return `(${InlineScript_prehydrateWorkspaceLayoutV2DesktopSidebar.toString()})(${JSON.stringify(getWorkspaceLayoutV2PrehydrationInlineArgs(args))}, ${readState.toString()});`;
}

export function buildWorkspaceLayoutV2MobilePanePrehydrationScript(
  args: WorkspaceLayoutV2PrehydrationArgs,
  readState: WorkspaceLayoutV2PrehydrationStateReader,
) {
  return `(${InlineScript_prehydrateWorkspaceLayoutV2MobilePane.toString()})(${JSON.stringify(getWorkspaceLayoutV2PrehydrationInlineArgs(args))}, ${readState.toString()});`;
}

export function clearWorkspaceLayoutV2DesktopPrehydrationStyle(
  args: WorkspaceLayoutV2PrehydrationArgs,
) {
  document.getElementById(args.desktopStyleElementId)?.remove();
}
