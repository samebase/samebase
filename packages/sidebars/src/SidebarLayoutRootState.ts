import {
  SIDEBAR_LAYOUT_DESKTOP_MAIN_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO,
  type SidebarLayoutMobileMinResizeBehavior,
} from "./SidebarLayoutGeometryInternal.ts";
import type { MobilePane, SidebarLayoutState, SidebarSide } from "./SidebarLayoutState.ts";

/*
The layout root carries the pane state as attributes and CSS variables, and structure.css lays the
panes out from them. Before React measures the viewport, the widths are CSS expressions of the
saved widths, fitted to the root's own width, so the server HTML and the first paint already show
the saved layout. This module is the one mapping from a state to that root. The server render, the
hydration render, and a consumer's inline script (`writeSidebarLayoutRootState`) all write the root
through it, so the paint before hydration and the render after it agree.
*/

export type SidebarLayoutRootAttributes = {
  "data-left-desktop-open": "" | undefined;
  "data-mobile-pane": MobilePane;
  "data-right-desktop-open": "" | undefined;
  "data-sidebar-layout-mobile-merged-side": SidebarSide | undefined;
};

export type SidebarLayoutRootVariables = {
  "--sidebar-layout-left-desktop-width": string;
  "--sidebar-layout-left-mobile-width": string;
  "--sidebar-layout-main-mobile-width": string;
  "--sidebar-layout-right-desktop-width": string;
  "--sidebar-layout-right-mobile-width": string;
};

export type SidebarLayoutRootState = {
  attributes: SidebarLayoutRootAttributes;
  variables: SidebarLayoutRootVariables;
};

export type SidebarLayoutRootStateArgs = {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  mobileMinResizeBehavior: SidebarLayoutMobileMinResizeBehavior;
  state: SidebarLayoutState;
};

export function getAvailableMobilePane({
  hasLeftPane,
  hasRightPane,
  mobilePane,
}: {
  hasLeftPane: boolean;
  hasRightPane: boolean;
  mobilePane: MobilePane;
}): MobilePane {
  if (mobilePane === "left" && !hasLeftPane) {
    return "main";
  }

  if (mobilePane === "right" && !hasRightPane) {
    return "main";
  }

  return mobilePane;
}

/**
A saved mobile sidebar width as CSS, clamped to the root width (`100%`) with the rules of
`getMobileSidebarWidthPx`: at least the smaller of the configured minimum and a third of the root,
at most the root without the main pane's peek.
*/
function getUnmeasuredMobileSidebarWidth(storedWidthPx: number) {
  const minWidth = `min(${SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_PX}px, round(down, 100% / ${1 / SIDEBAR_LAYOUT_MOBILE_SIDEBAR_MIN_WIDTH_RATIO}, 1px))`;

  return `clamp(${minWidth}, ${Math.round(storedWidthPx)}px, calc(100% - ${SIDEBAR_LAYOUT_MOBILE_MAIN_PEEK_WIDTH_PX}px))`;
}

/**
A saved merged surface shows its side pane beside a main pane that fills the rest of the root when
the rest is at least the main pane's minimum, and a full-width main pane otherwise: the clamp adds
the side pane width back as soon as the rest falls below that minimum.
*/
function getUnmeasuredMergedMainWidth(sideWidth: string) {
  const rest = `100% - ${sideWidth}`;

  return `calc(${rest} + clamp(0px, (${SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX}px - (${rest})) * 1000, ${sideWidth}))`;
}

/**
The desktop pane widths as CSS fitted to the root width (`100%`) with the rules of
`getDesktopPaneWidths`: an open sidebar keeps its saved width while the main pane keeps its minimum,
and two open sidebars that do not fit share the free width in proportion to their width above the
sidebar minimum. Both are at least the minimum, so a desktop root always fits them.
*/
function getUnmeasuredDesktopWidths({
  leftOpen,
  leftWidthPx,
  rightOpen,
  rightWidthPx,
}: {
  leftOpen: boolean;
  leftWidthPx: number;
  rightOpen: boolean;
  rightWidthPx: number;
}) {
  const mainMin = SIDEBAR_LAYOUT_DESKTOP_MAIN_MIN_WIDTH_PX;
  const sidebarMin = SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX;
  const left = leftOpen ? Math.max(sidebarMin, Math.round(leftWidthPx)) : 0;
  const right = rightOpen ? Math.max(sidebarMin, Math.round(rightWidthPx)) : 0;
  const extraPx = left + right - (Number(leftOpen) + Number(rightOpen)) * sidebarMin;
  if (leftOpen && rightOpen && extraPx > 0) {
    const leftShare = (left - sidebarMin) / extraPx;
    const leftWidth = `min(${left}px, round(${sidebarMin}px + (100% - ${mainMin + 2 * sidebarMin}px) * ${leftShare}, 1px))`;

    return {
      left: leftWidth,
      right: `min(${right}px, calc(100% - ${mainMin}px - ${leftWidth}))`,
    };
  }

  return {
    left: leftOpen ? `min(${left}px, calc(100% - ${mainMin}px))` : "0px",
    right: rightOpen ? `min(${right}px, calc(100% - ${mainMin}px))` : "0px",
  };
}

/** The root attributes and variables of a state before React measures the viewport. */
export function getSidebarLayoutRootState({
  hasLeftPane,
  hasRightPane,
  mobileMinResizeBehavior,
  state,
}: SidebarLayoutRootStateArgs): SidebarLayoutRootState {
  const mobilePane = getAvailableMobilePane({
    hasLeftPane,
    hasRightPane,
    mobilePane: state.mobilePane,
  });
  const desktop = getUnmeasuredDesktopWidths({
    leftOpen: hasLeftPane && state.leftDesktopOpen,
    leftWidthPx: state.leftDesktopWidthPx,
    rightOpen: hasRightPane && state.rightDesktopOpen,
    rightWidthPx: state.rightDesktopWidthPx,
  });
  const leftMobileWidth = getUnmeasuredMobileSidebarWidth(state.leftMobileWidthPx);
  const rightMobileWidth = getUnmeasuredMobileSidebarWidth(state.rightMobileWidthPx);
  const mergedSide =
    mobileMinResizeBehavior === "min_resize_to_merge" &&
    state.mobileSurface.kind === "merged" &&
    mobilePane !== "main" &&
    (state.mobileSurface.side === "left" ? hasLeftPane : hasRightPane)
      ? state.mobileSurface.side
      : undefined;

  return {
    attributes: {
      "data-left-desktop-open": hasLeftPane && state.leftDesktopOpen ? "" : undefined,
      "data-mobile-pane": mobilePane,
      "data-right-desktop-open": hasRightPane && state.rightDesktopOpen ? "" : undefined,
      "data-sidebar-layout-mobile-merged-side": mergedSide,
    },
    variables: {
      "--sidebar-layout-left-desktop-width": desktop.left,
      "--sidebar-layout-left-mobile-width": hasLeftPane ? leftMobileWidth : "0px",
      "--sidebar-layout-main-mobile-width":
        mergedSide === undefined
          ? "100%"
          : getUnmeasuredMergedMainWidth(
              mergedSide === "left" ? leftMobileWidth : rightMobileWidth,
            ),
      "--sidebar-layout-right-desktop-width": desktop.right,
      "--sidebar-layout-right-mobile-width": hasRightPane ? rightMobileWidth : "0px",
    },
  };
}

/**
Writes a state on a rendered layout root, for an inline script that runs as the root's first child
(`document.currentScript.parentElement`), before the browser parses the panes. A page whose server
render cannot read the consumer's stored state renders such a script, so the first paint shows the
stored state. The root's own attributes say which panes the render has.
*/
export function writeSidebarLayoutRootState(root: HTMLElement, state: SidebarLayoutState) {
  const { attributes, variables } = getSidebarLayoutRootState({
    hasLeftPane: root.hasAttribute("data-has-left-pane"),
    hasRightPane: root.hasAttribute("data-has-right-pane"),
    mobileMinResizeBehavior:
      root.getAttribute("data-mobile-min-resize-behavior") === "min_resize_to_slide"
        ? "min_resize_to_slide"
        : "min_resize_to_merge",
    state,
  });
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined) {
      root.removeAttribute(name);
    } else {
      root.setAttribute(name, value);
    }
  }
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}
