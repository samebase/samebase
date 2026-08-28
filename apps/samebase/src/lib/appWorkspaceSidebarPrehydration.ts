import {
  buildSidebarLayoutDesktopPrehydrationScript,
  buildSidebarLayoutMobilePanePrehydrationScript,
  clearSidebarLayoutDesktopPrehydrationStyle,
  type SidebarLayoutPrehydrationArgs,
  type SidebarLayoutPrehydrationState,
} from "@samebase/sidebars/prehydration";

const APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-workspace-sidebar-prehydration";

const appWorkspaceSidebarPrehydrationArgs = {
  desktopStyleElementId: APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID,
} satisfies SidebarLayoutPrehydrationArgs;

/**
 * The package serializes this function into the prehydration script. Keep it
 * self-contained, including the app-owned storage key, envelope version, and
 * validation.
 */
function readAppWorkspaceSidebarPrehydrationState(): SidebarLayoutPrehydrationState | null {
  function getWorkspaceSidebarState(value: unknown): SidebarLayoutPrehydrationState | null {
    function getMobilePane(value: unknown): SidebarLayoutPrehydrationState["mobilePane"] | null {
      if (value === "left" || value === "main" || value === "right") {
        return value;
      }

      return null;
    }

    function getMobileSurface(
      value: unknown,
    ): SidebarLayoutPrehydrationState["mobileSurface"] | null {
      if (value === null || typeof value !== "object" || !("kind" in value)) return null;

      if (value.kind === "unmerged") {
        return { kind: "unmerged" };
      }

      if (
        value.kind === "merged" &&
        "side" in value &&
        "mainWidthPx" in value &&
        (value.side === "left" || value.side === "right") &&
        typeof value.mainWidthPx === "number" &&
        Number.isFinite(value.mainWidthPx)
      ) {
        return {
          kind: "merged",
          mainWidthPx: value.mainWidthPx,
          side: value.side,
        };
      }

      return null;
    }

    function getFiniteNumber(value: unknown) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }

    if (value === null || typeof value !== "object") return null;
    if (!("leftDesktopOpen" in value) || !("leftDesktopWidthPx" in value)) return null;
    if (!("leftMobileWidthPx" in value) || !("mobilePane" in value)) return null;
    if (!("mobileSurface" in value)) return null;
    if (!("rightDesktopOpen" in value) || !("rightDesktopWidthPx" in value)) return null;
    if (!("rightMobileWidthPx" in value)) return null;

    const leftDesktopWidthPx = getFiniteNumber(value.leftDesktopWidthPx);
    const leftMobileWidthPx = getFiniteNumber(value.leftMobileWidthPx);
    const mobilePane = getMobilePane(value.mobilePane);
    const mobileSurface = getMobileSurface(value.mobileSurface);
    const rightDesktopWidthPx = getFiniteNumber(value.rightDesktopWidthPx);
    const rightMobileWidthPx = getFiniteNumber(value.rightMobileWidthPx);

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

  try {
    const serializedState = window.localStorage.getItem("samebase_app_workspace_sidebar_state");
    if (serializedState === null) return null;

    const storedState: unknown = JSON.parse(serializedState);
    if (storedState === null || typeof storedState !== "object") return null;
    if (!("version" in storedState) || storedState.version !== 2) return null;
    if (!("state" in storedState)) return null;

    return getWorkspaceSidebarState(storedState.state);
  } catch {
    return null;
  }
}

export const appWorkspaceSidebarPrehydrationScript = buildSidebarLayoutDesktopPrehydrationScript(
  appWorkspaceSidebarPrehydrationArgs,
  readAppWorkspaceSidebarPrehydrationState,
);
export const appWorkspaceMobilePanePrehydrationScript =
  buildSidebarLayoutMobilePanePrehydrationScript(
    appWorkspaceSidebarPrehydrationArgs,
    readAppWorkspaceSidebarPrehydrationState,
  );

export function clearAppWorkspaceSidebarDesktopPrehydrationStyle() {
  clearSidebarLayoutDesktopPrehydrationStyle(appWorkspaceSidebarPrehydrationArgs);
}
