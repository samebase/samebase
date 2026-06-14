import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "@/lib/appWorkspaceSidebarPreferences";
import { WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import {
  WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
} from "@/components/workspace-layout-v2/workspaceLayoutV2Prehydration";

type AppWorkspaceSidebarPrehydrationArgs = {
  storageKey: string;
  storageVersion: number;
  desktopSidebarMinWidthPx: number;
  leftDesktopWidthProperty: string;
  rightDesktopWidthProperty: string;
};

const appWorkspaceSidebarPrehydrationArgs = {
  desktopSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  leftDesktopWidthProperty: WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  rightDesktopWidthProperty: WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} satisfies AppWorkspaceSidebarPrehydrationArgs;

function runAppWorkspaceSidebarPrehydration(args: AppWorkspaceSidebarPrehydrationArgs) {
  function readDesktopWidth(open: unknown, width: unknown) {
    if (open === false) return "0px";
    if (open !== true) return null;

    if (typeof width !== "number" || !Number.isFinite(width)) return null;

    return Math.max(args.desktopSidebarMinWidthPx, Math.round(width)) + "px";
  }

  try {
    const storedValue = window.localStorage.getItem(args.storageKey);
    if (storedValue === null) return;

    const stored: unknown = JSON.parse(storedValue);
    if (stored === null || typeof stored !== "object") return;
    if (!("version" in stored) || stored.version !== args.storageVersion) return;
    if (!("state" in stored)) return;

    const state = stored.state;
    if (state === null || typeof state !== "object") return;
    if (!("leftDesktopOpen" in state) || !("leftDesktopWidthPx" in state)) return;
    if (!("rightDesktopOpen" in state) || !("rightDesktopWidthPx" in state)) return;

    const leftDesktopWidth = readDesktopWidth(state.leftDesktopOpen, state.leftDesktopWidthPx);
    const rightDesktopWidth = readDesktopWidth(state.rightDesktopOpen, state.rightDesktopWidthPx);
    if (leftDesktopWidth === null || rightDesktopWidth === null) return;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty(args.leftDesktopWidthProperty, leftDesktopWidth);
    rootStyle.setProperty(args.rightDesktopWidthProperty, rightDesktopWidth);
  } catch {}
}

export const appWorkspaceSidebarPrehydrationScript = `(${runAppWorkspaceSidebarPrehydration.toString()})(${JSON.stringify(appWorkspaceSidebarPrehydrationArgs)});`;

export function clearAppWorkspaceSidebarPrehydrationStyle() {
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  );
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  );
}
