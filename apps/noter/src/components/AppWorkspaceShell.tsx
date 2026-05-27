import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvexAuth } from "convex/react";
import { useLocation } from "@tanstack/react-router";
import PullToRefresh from "react-simple-pull-to-refresh";
import { RefreshCw } from "lucide-react";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
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
type AppWorkspaceRouteChromePane = WorkspaceLayoutV2PaneFrameProps | null;

type AppWorkspaceRouteChromeConfig = {
  dataTestId?: string;
  headerAccessory?: ReactNode;
  left?: AppWorkspaceRouteChromePane;
  leftToggleVisibility?: AppWorkspaceShellToggleVisibility;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePanePeekWidthPx?: number;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: AppWorkspaceRouteChromePane;
  rightToggleVisibility?: AppWorkspaceShellToggleVisibility;
  shortcutPaneSide?: WorkspacePaneSide;
};

type AppWorkspaceRouteChromeSnapshot = AppWorkspaceRouteChromeConfig & {
  pathname: string;
};

type AppWorkspaceRouteChromeRegistration = {
  chrome: AppWorkspaceRouteChromeSnapshot;
  depth: number;
  order: number;
};

type AppWorkspaceRouteChromeStore = {
  getSnapshot: () => AppWorkspaceRouteChromeSnapshot | null;
  register: (id: symbol, chrome: AppWorkspaceRouteChromeSnapshot, depth: number) => void;
  subscribe: (listener: () => void) => () => void;
  unregister: (id: symbol) => void;
  update: (id: symbol, chrome: AppWorkspaceRouteChromeSnapshot) => void;
};

type AppWorkspaceRouteChromeContextValue = {
  depth: number;
  store: AppWorkspaceRouteChromeStore;
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

const AppWorkspaceRouteChromeContext = createContext<AppWorkspaceRouteChromeContextValue | null>(
  null,
);

function createAppWorkspaceRouteChromeStore(): AppWorkspaceRouteChromeStore {
  let order = 0;
  let snapshot: AppWorkspaceRouteChromeSnapshot | null = null;
  const registrations = new Map<symbol, AppWorkspaceRouteChromeRegistration>();
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const readActiveSnapshot = () => {
    let activeRegistration: AppWorkspaceRouteChromeRegistration | null = null;
    for (const registration of registrations.values()) {
      if (
        activeRegistration === null ||
        registration.depth > activeRegistration.depth ||
        (registration.depth === activeRegistration.depth &&
          registration.order > activeRegistration.order)
      ) {
        activeRegistration = registration;
      }
    }

    return activeRegistration?.chrome ?? null;
  };

  const refreshSnapshot = () => {
    snapshot = readActiveSnapshot();
    notify();
  };

  return {
    getSnapshot: () => snapshot,
    register: (id, chrome, depth) => {
      order += 1;
      registrations.set(id, {
        chrome,
        depth,
        order,
      });
      refreshSnapshot();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unregister: (id) => {
      registrations.delete(id);
      refreshSnapshot();
    },
    update: (id, chrome) => {
      const registration = registrations.get(id);
      if (registration) {
        registrations.set(id, {
          ...registration,
          chrome,
        });
        refreshSnapshot();
      }
    },
  };
}

function useAppWorkspaceRouteChrome(store: AppWorkspaceRouteChromeStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

function isIosStandaloneApp(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // Browser-mode iOS already has Safari's own refresh gesture; standalone Home Screen apps do not.
  if (Reflect.get(navigator, "standalone") === true) {
    return true;
  }

  const isIosLike =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return (
    isIosLike &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function AppWorkspacePullToRefreshIndicator() {
  return (
    <div className="flex h-12 items-center justify-center text-muted-foreground" aria-hidden="true">
      <RefreshCw className="size-4 animate-spin" />
    </div>
  );
}

function AppWorkspacePullToRefresh({ children }: { children: ReactNode }) {
  const handleRefresh = useCallback(() => {
    window.location.reload();
    return Promise.resolve();
  }, []);
  const indicator = <AppWorkspacePullToRefreshIndicator />;

  return (
    <PullToRefresh
      className="noter-pull-to-refresh h-full min-h-0 bg-background"
      isPullable={isIosStandaloneApp()}
      maxPullDownDistance={96}
      onRefresh={handleRefresh}
      pullDownThreshold={72}
      pullingContent={indicator}
      refreshingContent={indicator}
      resistance={1.2}
    >
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </PullToRefresh>
  );
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
  const leftPane = chrome?.left === null ? undefined : (chrome?.left ?? {});
  const rightPane = chrome?.right === null ? undefined : (chrome?.right ?? publicRightSidebarPane);

  return (
    <WorkspacePaneRuntimeProvider
      controller={sidebarState}
      shortcutPaneSide={chrome?.shortcutPaneSide ?? "right"}
    >
      <WorkspaceLayoutV2FullPage
        dataTestId={chrome?.dataTestId ?? APP_WORKSPACE_DATA_TEST_ID}
        left={leftPane}
        leftToggleVisibility={chrome?.leftToggleVisibility ?? "desktop"}
        main={mainPane}
        mobileMinResizeBehavior={chrome?.mobileMinResizeBehavior}
        mobilePanePeekWidthPx={
          chrome?.mobilePanePeekWidthPx ?? APP_WORKSPACE_DEFAULT_MOBILE_PEEK_WIDTH_PX
        }
        panel={chrome?.panel}
        right={rightPane}
        rightToggleVisibility={chrome?.rightToggleVisibility ?? "desktop"}
      />
    </WorkspacePaneRuntimeProvider>
  );
}

export function AppWorkspaceShell({ children }: { children?: ReactNode }) {
  const chromeStore = useMemo(createAppWorkspaceRouteChromeStore, []);
  const chromeContextValue = useMemo(
    () => ({
      depth: 0,
      store: chromeStore,
    }),
    [chromeStore],
  );
  const chrome = useAppWorkspaceRouteChrome(chromeStore);

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeContextValue}>
      <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
        <AppWorkspacePullToRefresh>
          <AppWorkspaceShellFrame chrome={chrome}>{children}</AppWorkspaceShellFrame>
        </AppWorkspacePullToRefresh>
      </div>
    </AppWorkspaceRouteChromeContext.Provider>
  );
}

export function AppWorkspaceRouteChrome({
  children,
  ...chrome
}: AppWorkspaceRouteChromeConfig & { children?: ReactNode }) {
  const context = useContext(AppWorkspaceRouteChromeContext);
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
  if (context === null) {
    throw new Error("App workspace route chrome is missing its shell.");
  }
  const { depth: parentDepth, store } = context;
  const depth = parentDepth + 1;
  const chromeContextValue = useMemo(
    () => ({
      depth,
      store,
    }),
    [depth, store],
  );

  useLayoutEffect(() => {
    store.register(id, { ...chromeRef.current, pathname }, depth);
    return () => {
      store.unregister(id);
    };
  }, [depth, id, pathname, store]);

  useLayoutEffect(() => {
    store.update(id, { ...chrome, pathname });
  });

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeContextValue}>
      {children}
    </AppWorkspaceRouteChromeContext.Provider>
  );
}
