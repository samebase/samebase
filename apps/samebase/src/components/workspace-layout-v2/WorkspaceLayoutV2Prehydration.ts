import { MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX } from "@/lib/workspacePaneSizes";
import type { WorkspaceSidebarState } from "../../../convex/userPreferenceModel";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
} from "./WorkspaceLayoutV2Geometry";

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
  storageKey: string;
  storageVersion: number;
};

type WorkspaceLayoutV2PrehydrationInlineArgs = WorkspaceLayoutV2PrehydrationArgs & {
  desktopSidebarMinWidthPx: number;
  mobileMainReachableWidthPx: number;
  mobileMainMinWidthPx: number;
  mobileSidebarMinWidthPx: number;
  mobileSidebarMinWidthRatio: number;
};

type ReadWorkspaceLayoutV2PrehydrationState = (
  value: unknown,
) => WorkspaceLayoutV2PrehydrationState | null;

function getWorkspaceLayoutV2PrehydrationInlineArgs(
  args: WorkspaceLayoutV2PrehydrationArgs,
): WorkspaceLayoutV2PrehydrationInlineArgs {
  return {
    ...args,
    desktopSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
    mobileMainReachableWidthPx: MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX,
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

The script exists because desktop sidebar geometry is per-device state. Static
server markup cannot read that state, so the initial markup uses default widths
and open-pane separator borders. This script reads the stored state before
hydration and applies a temporary stylesheet for the first desktop paint. A
closed prehydrated pane must have zero total layout width, including its
separator border, so the sidebar controls do not move when React takes
ownership.

The stylesheet targets the server-rendered pane elements directly instead of
writing custom properties on documentElement. The viewport markup has its own
inline desktop-width custom properties, and those element-level properties would
override inherited root values.

The rule is emitted into Tailwind's utilities layer because the app's desktop
pane width rules also live there and use important declarations. An unlayered
important declaration loses to the layered app rule in Chrome, so it would not
affect the first paint.

The selector must include the measured-viewport guard. React adds
data-workspace-layout-v2-measured after ResizeObserver reports the viewport
size. Once that attribute is present, the temporary stylesheet no longer
matches, and the panes use React's live inline widths for resizing and normal
layout updates.
*/
function InlineScript_prehydrateWorkspaceLayoutV2DesktopSidebar(
  args: WorkspaceLayoutV2PrehydrationInlineArgs,
  readWorkspaceSidebarState: ReadWorkspaceLayoutV2PrehydrationState,
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
      ".workspace-layout-v2-responsive-viewport:not([data-workspace-layout-v2-measured])";
    // Server markup may still carry open-state desktop border classes. A
    // closed prehydrated pane must contribute zero layout geometry, including
    // its separator border.
    const leftDesktopSeparatorRule = left.open ? "" : "border-right-width: 0 !important;";
    const rightDesktopSeparatorRule = right.open ? "" : "border-left-width: 0 !important;";
    const cssText = `
@layer utilities {
  @media (min-width: 768px) {
    ${viewportSelector} .workspace-layout-v2-responsive-left-pane {
      width: ${left.width} !important;
      ${leftDesktopSeparatorRule}
    }

    ${viewportSelector} .workspace-layout-v2-responsive-right-pane {
      width: ${right.width} !important;
      ${rightDesktopSeparatorRule}
    }
  }
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
    const storedValue = window.localStorage.getItem(args.storageKey);
    if (storedValue === null) return;

    const stored: unknown = JSON.parse(storedValue);
    if (stored === null || typeof stored !== "object") return;
    if (!("version" in stored) || stored.version !== args.storageVersion) return;
    if (!("state" in stored)) return;

    const state = readWorkspaceSidebarState(stored.state);
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
  readWorkspaceSidebarState: ReadWorkspaceLayoutV2PrehydrationState,
) {
  function getStoredWorkspaceSidebarState() {
    const storedValue = window.localStorage.getItem(args.storageKey);
    if (storedValue === null) return null;

    const stored: unknown = JSON.parse(storedValue);
    if (stored === null || typeof stored !== "object") return null;
    if (!("version" in stored) || stored.version !== args.storageVersion) return null;
    if (!("state" in stored)) return null;

    return readWorkspaceSidebarState(stored.state);
  }

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
    const layoutRoot = carouselNode.closest('[data-workspace-layout-v2="responsive"]');

    return layoutRoot instanceof window.HTMLElement ? layoutRoot : null;
  }

  function findWorkspaceLayoutCarousel(scriptElement: HTMLScriptElement) {
    let layoutElement = scriptElement.previousElementSibling;
    while (layoutElement !== null) {
      if (layoutElement instanceof window.HTMLElement) {
        if (layoutElement.classList.contains("workspace-layout-v2-responsive-viewport")) {
          return layoutElement;
        }

        const carouselNode = layoutElement.querySelector(
          ".workspace-layout-v2-responsive-viewport",
        );
        if (carouselNode instanceof window.HTMLElement) {
          return carouselNode;
        }
      }

      layoutElement = layoutElement.previousElementSibling;
    }

    return null;
  }

  try {
    if (window.innerWidth >= 768) return;

    const scriptElement = document.currentScript;
    if (!(scriptElement instanceof window.HTMLScriptElement)) return;

    const carouselNode = findWorkspaceLayoutCarousel(scriptElement);
    if (carouselNode === null) return;
    const layoutRoot = getWorkspaceLayoutRoot(carouselNode);
    if (layoutRoot === null) return;

    const state = getStoredWorkspaceSidebarState();
    if (state === null) return;

    const hasLeftPane =
      carouselNode.querySelector('[data-testid="workspace-layout-v2-pane-left"]') !== null;
    const hasRightPane =
      carouselNode.querySelector('[data-testid="workspace-layout-v2-pane-right"]') !== null;
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
  readWorkspaceSidebarState: ReadWorkspaceLayoutV2PrehydrationState,
) {
  return `(${InlineScript_prehydrateWorkspaceLayoutV2DesktopSidebar.toString()})(${JSON.stringify(getWorkspaceLayoutV2PrehydrationInlineArgs(args))}, ${readWorkspaceSidebarState.toString()});`;
}

export function buildWorkspaceLayoutV2MobilePanePrehydrationScript(
  args: WorkspaceLayoutV2PrehydrationArgs,
  readWorkspaceSidebarState: ReadWorkspaceLayoutV2PrehydrationState,
) {
  return `(${InlineScript_prehydrateWorkspaceLayoutV2MobilePane.toString()})(${JSON.stringify(getWorkspaceLayoutV2PrehydrationInlineArgs(args))}, ${readWorkspaceSidebarState.toString()});`;
}

export function clearWorkspaceLayoutV2DesktopPrehydrationStyle(
  args: WorkspaceLayoutV2PrehydrationArgs,
) {
  document.getElementById(args.desktopStyleElementId)?.remove();
}
