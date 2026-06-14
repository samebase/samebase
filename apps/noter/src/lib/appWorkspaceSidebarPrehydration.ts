import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "@/lib/appWorkspaceSidebarPreferences";
import { WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import {
  WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
} from "@/components/workspace-layout-v2/workspaceLayoutV2Prehydration";
import type { Sure } from "@samebase/sure";

type AppWorkspaceSidebarPrehydrationArgs = {
  storageKey: string;
  storageVersion: number;
  desktopSidebarMinWidthPx: number;
  leftDesktopWidthProperty: string;
  rightDesktopWidthProperty: string;
};

type AppWorkspaceSidebarPrehydratedWidths = {
  leftDesktopWidth: string;
  rightDesktopWidth: string;
};

const appWorkspaceSidebarPrehydrationArgs = {
  desktopSidebarMinWidthPx: WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  leftDesktopWidthProperty: WORKSPACE_LAYOUT_V2_PREHYDRATED_LEFT_DESKTOP_WIDTH_PROPERTY,
  rightDesktopWidthProperty: WORKSPACE_LAYOUT_V2_PREHYDRATED_RIGHT_DESKTOP_WIDTH_PROPERTY,
  storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} satisfies AppWorkspaceSidebarPrehydrationArgs;

function runAppWorkspaceSidebarPrehydration(args: AppWorkspaceSidebarPrehydrationArgs) {
  function good<const Value>(value: Value) {
    return [true, value] as const;
  }

  function bad<const Issue extends string>(issue: Issue) {
    return [false, issue] as const;
  }

  const desktopWidthSchema = ((value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return bad("not-finite-number");
    }

    return good(Math.max(args.desktopSidebarMinWidthPx, Math.round(value)) + "px");
  }) satisfies Sure<string, string, unknown>;

  const desktopSidebarWidthSchema = ((value: { open: unknown; widthPx: unknown }) => {
    if (value.open === false) {
      return good("0px");
    }
    if (value.open !== true) {
      return bad("not-open-boolean");
    }

    return desktopWidthSchema(value.widthPx);
  }) satisfies Sure<string, string, { open: unknown; widthPx: unknown }>;

  const prehydratedWidthsSchema = ((value: unknown) => {
    if (value === null || typeof value !== "object") {
      return bad("not-object");
    }
    if (!("leftDesktopOpen" in value) || !("leftDesktopWidthPx" in value)) {
      return bad("missing-left-desktop");
    }
    if (!("rightDesktopOpen" in value) || !("rightDesktopWidthPx" in value)) {
      return bad("missing-right-desktop");
    }

    const leftDesktopWidth = desktopSidebarWidthSchema({
      open: value.leftDesktopOpen,
      widthPx: value.leftDesktopWidthPx,
    });
    if (!leftDesktopWidth[0]) {
      return bad(leftDesktopWidth[1]);
    }

    const rightDesktopWidth = desktopSidebarWidthSchema({
      open: value.rightDesktopOpen,
      widthPx: value.rightDesktopWidthPx,
    });
    if (!rightDesktopWidth[0]) {
      return bad(rightDesktopWidth[1]);
    }

    return good({
      leftDesktopWidth: leftDesktopWidth[1],
      rightDesktopWidth: rightDesktopWidth[1],
    });
  }) satisfies Sure<string, AppWorkspaceSidebarPrehydratedWidths, unknown>;

  const storedPrehydratedWidthsSchema = ((value: unknown) => {
    if (value === null || typeof value !== "object") {
      return bad("not-object");
    }
    if (!("version" in value) || value.version !== args.storageVersion) {
      return bad("unsupported-version");
    }
    if (!("state" in value)) {
      return bad("missing-state");
    }

    return prehydratedWidthsSchema(value.state);
  }) satisfies Sure<string, AppWorkspaceSidebarPrehydratedWidths, unknown>;

  try {
    const storedValue = window.localStorage.getItem(args.storageKey);
    if (storedValue === null) return;

    const prehydratedWidths = storedPrehydratedWidthsSchema(JSON.parse(storedValue));
    if (!prehydratedWidths[0]) return;

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty(args.leftDesktopWidthProperty, prehydratedWidths[1].leftDesktopWidth);
    rootStyle.setProperty(args.rightDesktopWidthProperty, prehydratedWidths[1].rightDesktopWidth);
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
