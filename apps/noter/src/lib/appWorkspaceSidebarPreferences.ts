import type { Sure } from "@samebase/sure";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

export const APP_WORKSPACE_SIDEBAR_STORAGE_KEY = "noter_app_workspace_sidebar_state";
export const APP_WORKSPACE_SIDEBAR_STORAGE_VERSION = 2;

export type AppWorkspaceSidebarStoredStateSchemaInput = {
  mobileMainMinWidthPx: number;
  storageVersion: number;
  value: unknown;
};

export const appWorkspaceSidebarStoredStateSchema = ((input) => {
  function readFiniteNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function readMobilePane(value: unknown): WorkspaceSidebarState["mobilePane"] | null {
    if (value === "left" || value === "main" || value === "right") {
      return value;
    }

    return null;
  }

  function readMobileSurface(value: unknown): WorkspaceSidebarState["mobileSurface"] | null {
    if (value === null || typeof value !== "object" || !("kind" in value)) {
      return null;
    }

    if (value.kind === "unmerged") {
      return { kind: "unmerged" };
    }

    if (!("side" in value) || !("mainWidthPx" in value)) {
      return null;
    }

    const mainWidthPx = readFiniteNumber(value.mainWidthPx);
    if (
      value.kind === "merged" &&
      (value.side === "left" || value.side === "right") &&
      mainWidthPx !== null &&
      mainWidthPx >= input.mobileMainMinWidthPx
    ) {
      return {
        kind: "merged",
        mainWidthPx,
        side: value.side,
      };
    }

    return null;
  }

  function readWorkspaceSidebarState(value: unknown): WorkspaceSidebarState | null {
    if (value === null || typeof value !== "object") {
      return null;
    }
    if (
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

  const stored = input.value;
  if (stored === null || typeof stored !== "object") {
    return [false, "not-object"] as const;
  }
  if (!("version" in stored) || stored.version !== input.storageVersion) {
    return [false, "unsupported-version"] as const;
  }
  if (!("state" in stored)) {
    return [false, "missing-state"] as const;
  }

  const state = readWorkspaceSidebarState(stored.state);
  if (state === null) {
    return [false, "invalid-state"] as const;
  }

  return [true, state] as const;
}) satisfies Sure<string, WorkspaceSidebarState, AppWorkspaceSidebarStoredStateSchemaInput>;
