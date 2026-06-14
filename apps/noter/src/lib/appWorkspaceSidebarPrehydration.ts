import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "@/lib/appWorkspaceSidebarPreferences";
import { WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import {
  WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
} from "@/components/workspace-layout-v2/workspaceLayoutV2Prehydration";

const storageKeyJson = JSON.stringify(APP_WORKSPACE_SIDEBAR_STORAGE_KEY);
const storageVersionJson = JSON.stringify(APP_WORKSPACE_SIDEBAR_STORAGE_VERSION);
const desktopSidebarMinWidthJson = JSON.stringify(WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX);
const leftDesktopWidthPropertyJson = JSON.stringify(
  WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
);
const rightDesktopWidthPropertyJson = JSON.stringify(
  WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
);

export const appWorkspaceSidebarPrehydrationScript = `
(() => {
  const storageKey = ${storageKeyJson};
  const storageVersion = ${storageVersionJson};
  const desktopSidebarMinWidthPx = ${desktopSidebarMinWidthJson};
  const leftDesktopWidthProperty = ${leftDesktopWidthPropertyJson};
  const rightDesktopWidthProperty = ${rightDesktopWidthPropertyJson};

  const readDesktopWidth = (state, openKey, widthKey) => {
    if (state[openKey] === false) return "0px";
    if (state[openKey] !== true) return null;

    const width = state[widthKey];
    if (typeof width !== "number" || !Number.isFinite(width)) return null;

    return Math.max(desktopSidebarMinWidthPx, Math.round(width)) + "px";
  };

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue === null) return;

    const stored = JSON.parse(storedValue);
    if (stored === null || typeof stored !== "object" || stored.version !== storageVersion) return;
    const state = stored.state;
    if (state === null || typeof state !== "object") return;

    const leftDesktopWidth = readDesktopWidth(state, "leftDesktopOpen", "leftDesktopWidthPx");
    const rightDesktopWidth = readDesktopWidth(state, "rightDesktopOpen", "rightDesktopWidthPx");
    if (leftDesktopWidth === null || rightDesktopWidth === null) return;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty(leftDesktopWidthProperty, leftDesktopWidth);
    rootStyle.setProperty(rightDesktopWidthProperty, rightDesktopWidth);
  } catch {}
})();
`;

export function clearAppWorkspaceSidebarPrehydrationStyle() {
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  );
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  );
}
