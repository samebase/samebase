import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "@/lib/appWorkspaceSidebarPreferences";
import { WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import {
  WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
} from "@/components/workspace-layout-v2/workspaceLayoutV2Prehydration";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

type AppWorkspaceSidebarPrehydrationArgs = {
  storageKey: string;
  storageVersion: number;
  desktopSidebarMinWidthPx: number;
  styleElementId: string;
};

type AppWorkspaceSidebarPrehydrationState = Pick<
  WorkspaceSidebarState,
  "leftDesktopOpen" | "leftDesktopWidthPx" | "rightDesktopOpen" | "rightDesktopWidthPx"
>;

const APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID =
  "noter-app-workspace-sidebar-prehydration";

declare global {
  interface Window {
    __noterAppWorkspaceSidebarPrehydrationStyleSheet?: CSSStyleSheet;
  }
}

const appWorkspaceSidebarPrehydrationArgs = {
  desktopSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
  styleElementId: APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID,
} satisfies AppWorkspaceSidebarPrehydrationArgs;

function getWorkspaceSidebarState(value: unknown): AppWorkspaceSidebarPrehydrationState | null {
  if (value === null || typeof value !== "object") return null;
  if (!("leftDesktopOpen" in value) || !("leftDesktopWidthPx" in value)) return null;
  if (!("rightDesktopOpen" in value) || !("rightDesktopWidthPx" in value)) return null;

  if (
    typeof value.leftDesktopOpen !== "boolean" ||
    typeof value.leftDesktopWidthPx !== "number" ||
    !Number.isFinite(value.leftDesktopWidthPx) ||
    typeof value.rightDesktopOpen !== "boolean" ||
    typeof value.rightDesktopWidthPx !== "number" ||
    !Number.isFinite(value.rightDesktopWidthPx)
  ) {
    return null;
  }

  return {
    leftDesktopOpen: value.leftDesktopOpen,
    leftDesktopWidthPx: value.leftDesktopWidthPx,
    rightDesktopOpen: value.rightDesktopOpen,
    rightDesktopWidthPx: value.rightDesktopWidthPx,
  };
}

/**
This function is serialized with Function#toString and emitted as a classic
inline head script before React hydration. Keep the body self-contained: it can
only reference browser globals, values passed through args, and helper functions
serialized into the call site.
*/
function InlineScript_prehidrateSidebar(
  args: AppWorkspaceSidebarPrehydrationArgs,
  readWorkspaceSidebarState: typeof getWorkspaceSidebarState,
) {
  function installPrehydrationStyle(leftDesktopWidth: string, rightDesktopWidth: string) {
    const viewportSelector =
      ".workspace-layout-v2-responsive-viewport:not([data-workspace-layout-v2-measured])";
    const cssText = `@media (min-width:768px){${viewportSelector} .workspace-layout-v2-responsive-left-pane{width:${leftDesktopWidth}!important;}${viewportSelector} .workspace-layout-v2-responsive-right-pane{width:${rightDesktopWidth}!important;}}`;

    if ("adoptedStyleSheets" in document && typeof CSSStyleSheet === "function") {
      const styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(cssText);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
      window.__noterAppWorkspaceSidebarPrehydrationStyleSheet = styleSheet;
      return;
    }

    const styleElement = document.createElement("style");
    styleElement.id = args.styleElementId;
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

    installPrehydrationStyle(leftDesktopWidth, rightDesktopWidth);
  } catch {}
}

export const appWorkspaceSidebarPrehydrationScript = `(${InlineScript_prehidrateSidebar.toString()})(${JSON.stringify(appWorkspaceSidebarPrehydrationArgs)}, ${getWorkspaceSidebarState.toString()});`;

export function clearAppWorkspaceSidebarPrehydrationStyle() {
  const styleSheet = window.__noterAppWorkspaceSidebarPrehydrationStyleSheet;
  if (styleSheet !== undefined) {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
      (candidateStyleSheet) => candidateStyleSheet !== styleSheet,
    );
    window.__noterAppWorkspaceSidebarPrehydrationStyleSheet = undefined;
  }

  document.getElementById(APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID)?.remove();
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  );
  document.documentElement.style.removeProperty(
    WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  );
}
