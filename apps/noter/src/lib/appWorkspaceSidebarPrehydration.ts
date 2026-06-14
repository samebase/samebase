import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
  appWorkspaceSidebarStoredStateSchema,
} from "@/lib/appWorkspaceSidebarPreferences";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import {
  WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
} from "@/components/workspace-layout-v2/workspaceLayoutV2Prehydration";

type AppWorkspaceSidebarPrehydrationArgs = {
  storageKey: string;
  storageVersion: number;
  desktopSidebarMinWidthPx: number;
  mobileMainMinWidthPx: number;
  leftDesktopWidthProperty: string;
  rightDesktopWidthProperty: string;
};

type AppWorkspaceSidebarStoredStateSchema = typeof appWorkspaceSidebarStoredStateSchema;

const appWorkspaceSidebarPrehydrationArgs = {
  desktopSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  leftDesktopWidthProperty: WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  mobileMainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  rightDesktopWidthProperty: WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} satisfies AppWorkspaceSidebarPrehydrationArgs;

function runAppWorkspaceSidebarPrehydration(
  args: AppWorkspaceSidebarPrehydrationArgs,
  storedStateSchema: AppWorkspaceSidebarStoredStateSchema,
) {
  function readDesktopWidth(open: boolean, widthPx: number) {
    if (!open) return "0px";

    return Math.max(args.desktopSidebarMinWidthPx, Math.round(widthPx)) + "px";
  }

  try {
    const storedValue = window.localStorage.getItem(args.storageKey);
    if (storedValue === null) return;

    const storedState = storedStateSchema({
      mobileMainMinWidthPx: args.mobileMainMinWidthPx,
      storageVersion: args.storageVersion,
      value: JSON.parse(storedValue),
    });
    if (!storedState[0]) return;

    const state = storedState[1];
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty(
      args.leftDesktopWidthProperty,
      readDesktopWidth(state.leftDesktopOpen, state.leftDesktopWidthPx),
    );
    rootStyle.setProperty(
      args.rightDesktopWidthProperty,
      readDesktopWidth(state.rightDesktopOpen, state.rightDesktopWidthPx),
    );
  } catch {}
}

export const appWorkspaceSidebarPrehydrationScript = `(${runAppWorkspaceSidebarPrehydration.toString()})(${JSON.stringify(appWorkspaceSidebarPrehydrationArgs)}, ${appWorkspaceSidebarStoredStateSchema.toString()});`;

export function clearAppWorkspaceSidebarPrehydrationStyle() {
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  );
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  );
}
