import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvexAuth } from "convex/react";
import { useLocation } from "@tanstack/react-router";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { RouteUrlEditor } from "@/components/RouteUrlEditor";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2FullPage";
import {
  WorkspacePaneRuntimeProvider,
  type WorkspacePaneSide,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import { type WorkspaceLayoutV2BottomPanelProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2BottomPanel";
import {
  type WorkspaceLayoutV2MobileMinResizeBehavior,
  DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { useLocalStorageWorkspaceSidebarState } from "@/hooks/useLocalStorageWorkspaceSidebarState";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
import { APP_WORKSPACE_SIDEBAR_STORAGE_KEY } from "@/lib/appWorkspaceSidebarPreferences";
import type { WorkspaceSidebarState } from "../../convex/workspaceSidebarStateModel";

type AppWorkspaceShellToggleVisibility = "all" | "desktop" | "hidden";

type AppWorkspaceRouteChromeConfig = {
  dataTestId?: string;
  headerAccessory?: ReactNode;
  left?: WorkspaceLayoutV2PaneFrameProps;
  leftToggleVisibility?: AppWorkspaceShellToggleVisibility;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePanePeekWidthPx?: number;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
  rightToggleVisibility?: AppWorkspaceShellToggleVisibility;
  shortcutPaneSide?: WorkspacePaneSide;
  showMobileResizeGripDots?: boolean;
};

type AppWorkspaceRouteChromeSnapshot = AppWorkspaceRouteChromeConfig & {
  pathname: string;
};

type AppWorkspaceRouteChromeStore = {
  getSnapshot: () => AppWorkspaceRouteChromeSnapshot | null;
  register: (id: symbol, chrome: AppWorkspaceRouteChromeSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
  unregister: (id: symbol) => void;
  update: (id: symbol, chrome: AppWorkspaceRouteChromeSnapshot) => void;
};

const APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX = 240;
const APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX = 288;
const APP_WORKSPACE_DATA_TEST_ID = "app-workspace";
const APP_WORKSPACE_DEFAULT_MOBILE_PEEK_WIDTH_PX = DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX;

const APP_WORKSPACE_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  leftMobileWidthPx: APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
  rightMobileWidthPx: APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
} satisfies WorkspaceSidebarState;

const AppWorkspaceRouteChromeContext = createContext<AppWorkspaceRouteChromeStore | null>(null);

function createAppWorkspaceRouteChromeStore(): AppWorkspaceRouteChromeStore {
  let activeId: symbol | null = null;
  let snapshot: AppWorkspaceRouteChromeSnapshot | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const setSnapshot = (id: symbol, nextSnapshot: AppWorkspaceRouteChromeSnapshot | null) => {
    activeId = nextSnapshot === null ? null : id;
    snapshot = nextSnapshot;
    notify();
  };

  return {
    getSnapshot: () => snapshot,
    register: (id, chrome) => {
      setSnapshot(id, chrome);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unregister: (id) => {
      if (activeId === id) {
        setSnapshot(id, null);
      }
    },
    update: (id, chrome) => {
      if (activeId === id) {
        setSnapshot(id, chrome);
      }
    },
  };
}

function useAppWorkspaceRouteChrome(store: AppWorkspaceRouteChromeStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function AppWorkspaceMainContent({ children }: { children?: ReactNode }) {
  return <div className="relative flex h-full min-h-0 flex-col">{children}</div>;
}

function AppWorkspaceMainHeader({ accessory }: { accessory?: ReactNode }) {
  return (
    <div className="flex h-full min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <RouteUrlEditor />
      </div>
      {accessory ? <div className="min-w-0 shrink-0">{accessory}</div> : null}
    </div>
  );
}

function useAppWorkspaceSidebarState() {
  const { isAuthenticated } = useConvexAuth();
  const localSidebarState = useLocalStorageWorkspaceSidebarState({
    defaults: APP_WORKSPACE_SIDEBAR_DEFAULT_STATE,
    reset: false,
    storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  });
  const persistedSidebarState = usePersistedWorkspaceSidebarState({
    defaults: APP_WORKSPACE_SIDEBAR_DEFAULT_STATE,
    workspaceKey: "app",
  });

  if (isAuthenticated && persistedSidebarState.isHydrated) {
    return persistedSidebarState;
  }

  return localSidebarState;
}

function AppWorkspaceShellFrame({
  children,
  chrome,
}: {
  children?: ReactNode;
  chrome: AppWorkspaceRouteChromeSnapshot | null;
}) {
  const sidebarState = useAppWorkspaceSidebarState();
  const publicRightSidebarPane = usePublicRightSidebarPane();
  const mainPane = {
    header: <AppWorkspaceMainHeader accessory={chrome?.headerAccessory} />,
    content: <AppWorkspaceMainContent>{children}</AppWorkspaceMainContent>,
  } satisfies WorkspaceLayoutV2PaneFrameProps;

  return (
    <PublicLandingLogoLinkProvider>
      <WorkspacePaneRuntimeProvider
        controller={sidebarState}
        shortcutPaneSide={chrome?.shortcutPaneSide ?? "right"}
      >
        <WorkspaceLayoutV2FullPage
          dataTestId={chrome?.dataTestId ?? APP_WORKSPACE_DATA_TEST_ID}
          left={chrome?.left ?? {}}
          leftToggleVisibility={chrome?.leftToggleVisibility ?? "desktop"}
          main={mainPane}
          mobileMinResizeBehavior={chrome?.mobileMinResizeBehavior}
          mobilePanePeekWidthPx={
            chrome?.mobilePanePeekWidthPx ?? APP_WORKSPACE_DEFAULT_MOBILE_PEEK_WIDTH_PX
          }
          panel={chrome?.panel}
          right={chrome?.right ?? publicRightSidebarPane}
          rightToggleVisibility={chrome?.rightToggleVisibility ?? "desktop"}
          showMobileResizeGripDots={chrome?.showMobileResizeGripDots}
        />
      </WorkspacePaneRuntimeProvider>
    </PublicLandingLogoLinkProvider>
  );
}

export function AppWorkspaceShell({ children }: { children?: ReactNode }) {
  const chromeStore = useMemo(createAppWorkspaceRouteChromeStore, []);
  const chrome = useAppWorkspaceRouteChrome(chromeStore);

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeStore}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <AppWorkspaceShellFrame chrome={chrome}>{children}</AppWorkspaceShellFrame>
      </div>
    </AppWorkspaceRouteChromeContext.Provider>
  );
}

export function AppWorkspaceRouteChrome({
  children,
  ...chrome
}: AppWorkspaceRouteChromeConfig & { children?: ReactNode }) {
  const store = useContext(AppWorkspaceRouteChromeContext);
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const idRef = useRef<symbol | null>(null);
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;
  if (idRef.current === null) {
    idRef.current = Symbol("app-workspace-route-chrome");
  }
  const id = idRef.current;

  useLayoutEffect(() => {
    if (store === null) {
      throw new Error("App workspace route chrome is missing its shell.");
    }

    store.register(id, { ...chromeRef.current, pathname });
    return () => {
      store.unregister(id);
    };
  }, [id, pathname, store]);

  useLayoutEffect(() => {
    if (store === null) {
      throw new Error("App workspace route chrome is missing its shell.");
    }

    store.update(id, { ...chrome, pathname });
  });

  return <>{children}</>;
}
