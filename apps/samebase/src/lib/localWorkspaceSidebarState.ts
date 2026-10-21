import { guard, isRecord } from "@samebase/dependent";
import { SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX } from "@samebase/sidebars/SidebarLayoutGeometry";
import type { SidebarLayoutState } from "@samebase/sidebars/SidebarLayoutState";
import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "./appWorkspaceSidebarPreferences";

/*
The sidebar state of a page that renders without a session: the public pages that the build
prerenders and the pages that the server renders for a visitor without one. A page rendered as the
user reads and writes Convex instead (`hooks/usePersistedWorkspaceSidebarState.ts`). The inline
prehydration script (`appWorkspaceSidebarPrehydrationScript.ts`) bundles this module too, so it
imports no React and no app aliases.
*/

const isFiniteNumber = guard<unknown, number>((value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null,
);

function parseMobilePane(value: unknown): SidebarLayoutState["mobilePane"] | null {
  if (value === "left" || value === "main" || value === "right") {
    return value;
  }

  return null;
}

function parseMobileSurface(value: unknown): SidebarLayoutState["mobileSurface"] | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value["kind"] === "unmerged") {
    return { kind: "unmerged" };
  }

  if (
    value["kind"] === "merged" &&
    (value["side"] === "left" || value["side"] === "right") &&
    isFiniteNumber(value["mainWidthPx"]) &&
    value["mainWidthPx"] >= SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX
  ) {
    return {
      kind: "merged",
      mainWidthPx: value["mainWidthPx"],
      side: value["side"],
    };
  }

  return null;
}

export function parseWorkspaceSidebarState(value: unknown): SidebarLayoutState | null {
  if (!isRecord(value)) {
    return null;
  }

  const mobilePane = parseMobilePane(value["mobilePane"]);
  const mobileSurface = parseMobileSurface(value["mobileSurface"]);
  if (
    typeof value["leftDesktopOpen"] !== "boolean" ||
    !isFiniteNumber(value["leftDesktopWidthPx"]) ||
    !isFiniteNumber(value["leftMobileWidthPx"]) ||
    mobilePane === null ||
    mobileSurface === null ||
    typeof value["rightDesktopOpen"] !== "boolean" ||
    !isFiniteNumber(value["rightDesktopWidthPx"]) ||
    !isFiniteNumber(value["rightMobileWidthPx"])
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value["leftDesktopOpen"],
    leftDesktopWidthPx: value["leftDesktopWidthPx"],
    leftMobileWidthPx: value["leftMobileWidthPx"],
    mobilePane,
    mobileSurface,
    rightDesktopOpen: value["rightDesktopOpen"],
    rightDesktopWidthPx: value["rightDesktopWidthPx"],
    rightMobileWidthPx: value["rightMobileWidthPx"],
  };
}

/** The stored state, or null when there is none or it is not a valid state of this version. */
export function readLocalWorkspaceSidebarState(): SidebarLayoutState | null {
  try {
    const serialized = window.localStorage.getItem(APP_WORKSPACE_SIDEBAR_STORAGE_KEY);
    if (serialized === null) {
      return null;
    }

    const stored: unknown = JSON.parse(serialized);
    return isRecord(stored) && stored["version"] === APP_WORKSPACE_SIDEBAR_STORAGE_VERSION
      ? parseWorkspaceSidebarState(stored["state"])
      : null;
  } catch {
    return null;
  }
}

export function writeLocalWorkspaceSidebarState(state: SidebarLayoutState) {
  try {
    window.localStorage.setItem(
      APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
      JSON.stringify({ state, version: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION }),
    );
  } catch {
    // A browser that denies storage keeps the change in this page.
  }
}
