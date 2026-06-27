import {
  buildWorkspaceLayoutV2DesktopPrehydrationScript,
  buildWorkspaceLayoutV2MobilePanePrehydrationScript,
  clearWorkspaceLayoutV2DesktopPrehydrationStyle,
  type WorkspaceLayoutV2PrehydrationArgs,
  type WorkspaceLayoutV2PrehydrationState,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2Prehydration";
import {
  APP_WORKSPACE_SIDEBAR_DEFAULT_STATE,
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "@/lib/appWorkspaceSidebarPreferences";

const APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-workspace-sidebar-prehydration";

const appWorkspaceSidebarPrehydrationArgs = {
  desktopStyleElementId: APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID,
  defaultState: APP_WORKSPACE_SIDEBAR_DEFAULT_STATE,
  storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} satisfies WorkspaceLayoutV2PrehydrationArgs;

function getWorkspaceSidebarState(value: unknown): WorkspaceLayoutV2PrehydrationState | null {
  function getMobilePane(value: unknown): WorkspaceLayoutV2PrehydrationState["mobilePane"] | null {
    if (value === "left" || value === "main" || value === "right") {
      return value;
    }

    return null;
  }

  function getMobileSurface(
    value: unknown,
  ): WorkspaceLayoutV2PrehydrationState["mobileSurface"] | null {
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

  if (value === null || typeof value !== "object") return null;
  if (!("leftDesktopOpen" in value) || !("leftDesktopWidthPx" in value)) return null;
  if (!("leftMobileWidthPx" in value) || !("mobilePane" in value)) return null;
  if (!("mobileSurface" in value)) return null;
  if (!("rightDesktopOpen" in value) || !("rightDesktopWidthPx" in value)) return null;
  if (!("rightMobileWidthPx" in value)) return null;

  const mobilePane = getMobilePane(value.mobilePane);
  const mobileSurface = getMobileSurface(value.mobileSurface);

  if (
    typeof value.leftDesktopOpen !== "boolean" ||
    typeof value.leftDesktopWidthPx !== "number" ||
    !Number.isFinite(value.leftDesktopWidthPx) ||
    typeof value.leftMobileWidthPx !== "number" ||
    !Number.isFinite(value.leftMobileWidthPx) ||
    mobilePane === null ||
    mobileSurface === null ||
    typeof value.rightDesktopOpen !== "boolean" ||
    typeof value.rightDesktopWidthPx !== "number" ||
    !Number.isFinite(value.rightDesktopWidthPx) ||
    typeof value.rightMobileWidthPx !== "number" ||
    !Number.isFinite(value.rightMobileWidthPx)
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value.leftDesktopOpen,
    leftDesktopWidthPx: value.leftDesktopWidthPx,
    leftMobileWidthPx: value.leftMobileWidthPx,
    mobilePane,
    mobileSurface,
    rightDesktopOpen: value.rightDesktopOpen,
    rightDesktopWidthPx: value.rightDesktopWidthPx,
    rightMobileWidthPx: value.rightMobileWidthPx,
  };
}

export const appWorkspaceSidebarPrehydrationScript =
  buildWorkspaceLayoutV2DesktopPrehydrationScript(
    appWorkspaceSidebarPrehydrationArgs,
    getWorkspaceSidebarState,
  );
export const appWorkspaceMobilePanePrehydrationScript =
  buildWorkspaceLayoutV2MobilePanePrehydrationScript(
    appWorkspaceSidebarPrehydrationArgs,
    getWorkspaceSidebarState,
  );

export function clearAppWorkspaceSidebarDesktopPrehydrationStyle() {
  clearWorkspaceLayoutV2DesktopPrehydrationStyle(appWorkspaceSidebarPrehydrationArgs);
}
