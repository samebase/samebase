import { SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX } from "@samebase/sidebars/SidebarLayoutGeometry";
import type { SidebarLayoutState } from "@samebase/sidebars/SidebarLayoutState";

/*
The example keeps its sidebar state in local storage, in a versioned envelope. The initial state
script (`exampleSidebarInitialStateScript.ts`) bundles this module too, so it imports no React.
*/

export const EXAMPLE_SIDEBAR_STORAGE_KEY = "samebase_sidebars_example_state";
export const EXAMPLE_SIDEBAR_STORAGE_VERSION = 1;

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readMobilePane(value: unknown) {
  return value === "left" || value === "main" || value === "right" ? value : null;
}

function readMobileSurface(value: unknown): SidebarLayoutState["mobileSurface"] | null {
  if (value === null || typeof value !== "object" || !("kind" in value)) {
    return null;
  }

  if (value.kind === "unmerged") {
    return { kind: "unmerged" };
  }

  if (
    value.kind !== "merged" ||
    !("mainWidthPx" in value) ||
    !("side" in value) ||
    (value.side !== "left" && value.side !== "right")
  ) {
    return null;
  }

  const mainWidthPx = readFiniteNumber(value.mainWidthPx);
  return mainWidthPx === null || mainWidthPx < SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX
    ? null
    : { kind: "merged", mainWidthPx, side: value.side };
}

function readState(value: unknown): SidebarLayoutState | null {
  if (
    value === null ||
    typeof value !== "object" ||
    !("leftDesktopOpen" in value) ||
    !("leftDesktopWidthPx" in value) ||
    !("leftMobileWidthPx" in value) ||
    !("mobilePane" in value) ||
    !("mobileSurface" in value) ||
    !("rightDesktopOpen" in value) ||
    !("rightDesktopWidthPx" in value) ||
    !("rightMobileWidthPx" in value)
  ) {
    return null;
  }

  const leftDesktopWidthPx = readFiniteNumber(value.leftDesktopWidthPx);
  const leftMobileWidthPx = readFiniteNumber(value.leftMobileWidthPx);
  const mobilePane = readMobilePane(value.mobilePane);
  const mobileSurface = readMobileSurface(value.mobileSurface);
  const rightDesktopWidthPx = readFiniteNumber(value.rightDesktopWidthPx);
  const rightMobileWidthPx = readFiniteNumber(value.rightMobileWidthPx);
  if (
    typeof value.leftDesktopOpen !== "boolean" ||
    leftDesktopWidthPx === null ||
    leftMobileWidthPx === null ||
    mobilePane === null ||
    mobileSurface === null ||
    typeof value.rightDesktopOpen !== "boolean" ||
    rightDesktopWidthPx === null ||
    rightMobileWidthPx === null
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value.leftDesktopOpen,
    leftDesktopWidthPx,
    leftMobileWidthPx,
    mobilePane,
    mobileSurface,
    rightDesktopOpen: value.rightDesktopOpen,
    rightDesktopWidthPx,
    rightMobileWidthPx,
  };
}

/**
The stored state, or null when there is none or it is not a valid state of this version. A merge
below the package's main pane minimum is not valid, so the script and the controller agree.
*/
export function readExampleSidebarStoredState(): SidebarLayoutState | null {
  try {
    const serializedState = window.localStorage.getItem(EXAMPLE_SIDEBAR_STORAGE_KEY);
    if (serializedState === null) {
      return null;
    }

    const storedValue: unknown = JSON.parse(serializedState);
    if (
      storedValue === null ||
      typeof storedValue !== "object" ||
      !("version" in storedValue) ||
      storedValue.version !== EXAMPLE_SIDEBAR_STORAGE_VERSION ||
      !("state" in storedValue)
    ) {
      return null;
    }

    return readState(storedValue.state);
  } catch {
    return null;
  }
}

export function writeExampleSidebarState(state: SidebarLayoutState) {
  try {
    window.localStorage.setItem(
      EXAMPLE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({
        state,
        version: EXAMPLE_SIDEBAR_STORAGE_VERSION,
      }),
    );
  } catch {}
}
