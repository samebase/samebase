import {
  buildWorkspaceLayoutV2DesktopPrehydrationScript,
  buildWorkspaceLayoutV2MobilePanePrehydrationScript,
  clearWorkspaceLayoutV2DesktopPrehydrationStyle,
  type WorkspaceLayoutV2PrehydrationArgs,
  type WorkspaceLayoutV2PrehydrationState,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2Prehydration";
import {
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} from "@/lib/appWorkspaceSidebarPreferences";

const APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID =
  "samebase-app-workspace-sidebar-prehydration";

const appWorkspaceSidebarPrehydrationArgs = {
  desktopStyleElementId: APP_WORKSPACE_SIDEBAR_PREHYDRATION_STYLE_ELEMENT_ID,
  storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  storageVersion: APP_WORKSPACE_SIDEBAR_STORAGE_VERSION,
} satisfies WorkspaceLayoutV2PrehydrationArgs;

type AppWorkspaceSidebarPrehydrationStateReader = (
  value: unknown,
) => WorkspaceLayoutV2PrehydrationState | null;

function InlineScript_prehydrateAppWorkspaceSettingsNavigation(
  args: Pick<WorkspaceLayoutV2PrehydrationArgs, "storageKey" | "storageVersion">,
  readWorkspaceSidebarState: AppWorkspaceSidebarPrehydrationStateReader,
) {
  if (window.innerWidth >= 768) return;

  function readStoredWorkspaceSidebarState() {
    const storedValue = window.localStorage.getItem(args.storageKey);
    if (storedValue === null) return null;

    const stored: unknown = JSON.parse(storedValue);
    if (stored === null || typeof stored !== "object") return null;
    if (!("version" in stored) || stored.version !== args.storageVersion) return null;
    if (!("state" in stored)) return null;

    return readWorkspaceSidebarState(stored.state);
  }

  function moveWorkspaceToMainPane() {
    const carouselNode = document.querySelector('[data-testid="workspace-layout-v2-pane-main"]');
    if (!(carouselNode instanceof window.HTMLElement)) return;

    const mainPane = carouselNode.querySelector("[data-workspace-layout-v2-mobile-main-pane]");
    if (!(mainPane instanceof window.HTMLElement)) return;

    const layoutRoot = carouselNode.closest('[data-workspace-layout-v2="responsive"]');
    if (layoutRoot instanceof window.HTMLElement) {
      layoutRoot.setAttribute("data-mobile-pane", "main");
      layoutRoot.removeAttribute("data-workspace-layout-v2-mobile-merged-side");
    }

    const panePeekPx = Number.parseFloat(window.getComputedStyle(carouselNode).paddingLeft);
    carouselNode.scrollLeft = mainPane.offsetLeft - (Number.isFinite(panePeekPx) ? panePeekPx : 0);
    carouselNode.dispatchEvent(new window.Event("scroll", { bubbles: true }));
  }

  function handleSettingsNavigation() {
    try {
      const state = readStoredWorkspaceSidebarState();
      if (state !== null) {
        window.localStorage.setItem(
          args.storageKey,
          JSON.stringify({
            state: {
              ...state,
              mobilePane: "main",
              mobileSurface: { kind: "unmerged" },
            },
            version: args.storageVersion,
          }),
        );
      }
    } catch {}

    moveWorkspaceToMainPane();
  }

  try {
    document.addEventListener(
      "click",
      (event) => {
        if (
          !(event instanceof window.MouseEvent) ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const target = event.target;
        if (!(target instanceof window.Element)) return;
        if (target.closest("[data-workspace-layout-v2-main-pane-link]") === null) return;

        handleSettingsNavigation();
      },
      true,
    );
  } catch {}
}

const appWorkspaceSettingsNavigationPrehydrationScript = `(${InlineScript_prehydrateAppWorkspaceSettingsNavigation.toString()})(${JSON.stringify(
  {
    storageKey: appWorkspaceSidebarPrehydrationArgs.storageKey,
    storageVersion: appWorkspaceSidebarPrehydrationArgs.storageVersion,
  },
)}, ${getWorkspaceSidebarState.toString()});`;

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
export const appWorkspaceMobilePanePrehydrationScript = `${buildWorkspaceLayoutV2MobilePanePrehydrationScript(
  appWorkspaceSidebarPrehydrationArgs,
  getWorkspaceSidebarState,
)}\n${appWorkspaceSettingsNavigationPrehydrationScript}`;

export function clearAppWorkspaceSidebarDesktopPrehydrationStyle() {
  clearWorkspaceLayoutV2DesktopPrehydrationStyle(appWorkspaceSidebarPrehydrationArgs);
}
