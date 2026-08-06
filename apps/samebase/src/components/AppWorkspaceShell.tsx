import {
  createContext,
  memo,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvexAuth } from "convex/react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useAppRightSidebarPane } from "@/components/useAppRightSidebarPane";
import { OrganizationContextProvider } from "@/components/OrganizationContext";
import { OrganizationContextLabel } from "@/components/OrganizationContextControl";
import { useOrganizationContext } from "@/lib/organizationContext";
import { RouteUrlEditorNext } from "@/components/RouteUrlEditor/RouteUrlEditorNext";
import { WorkspaceLayoutV2FullPage } from "@/components/workspace-layout-v2/WorkspaceLayoutV2FullPage";
import {
  WorkspacePaneRuntimeProvider,
  type WorkspacePaneSide,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import { type WorkspaceLayoutV2MobileMinResizeBehavior } from "@/components/workspace-layout-v2/WorkspaceLayoutV2Geometry";
import { type WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { useLocalStorageWorkspaceSidebarState } from "@/hooks/useLocalStorageWorkspaceSidebarState";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
import {
  appWorkspaceMobilePanePrehydrationScript,
  clearAppWorkspaceSidebarDesktopPrehydrationStyle,
} from "@/lib/appWorkspaceSidebarPrehydration";
import {
  APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
} from "@/lib/appWorkspaceSidebarPreferences";
import type { AppWorkspaceRouteChromeStaticData } from "@/routing/permissions";
import type { WorkspaceSidebarState } from "../../convex/userPreferenceModel";

type AppWorkspaceShellToggleVisibility = "all" | "desktop" | "hidden";
type AppWorkspaceRouteChromePane = WorkspaceLayoutV2PaneFrameProps | null;

type AppWorkspaceRouteChromeConfig = {
  dataTestId?: string;
  headerAccessory?: ReactNode;
  left?: AppWorkspaceRouteChromePane;
  leftToggleVisibility?: AppWorkspaceShellToggleVisibility;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
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

type AppWorkspaceRouteWithStaticData = {
  options: {
    staticData?: {
      appWorkspaceRouteChrome?: AppWorkspaceRouteChromeStaticData;
    };
  };
};

const APP_WORKSPACE_DATA_TEST_ID = "app-workspace";
const VISUAL_FIXTURE_PATHNAME = "/visual-fixture";

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
    const nextSnapshot = readActiveSnapshot();
    if (snapshot === nextSnapshot) {
      return;
    }

    snapshot = nextSnapshot;
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
        if (registration.chrome === chrome) {
          return;
        }

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

function readAppWorkspaceRouteChromeStaticDataFromRoutes(
  routes: readonly AppWorkspaceRouteWithStaticData[],
): AppWorkspaceRouteChromeStaticData | null {
  const leafRoute = routes.at(-1);
  return leafRoute?.options.staticData?.appWorkspaceRouteChrome ?? null;
}

function useAppWorkspaceRouteChromeStaticData() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const router = useRouter();

  return readAppWorkspaceRouteChromeStaticDataFromRoutes(
    router.getMatchedRoutes(pathname).matchedRoutes,
  );
}

const AppWorkspaceMainContent = memo(function AppWorkspaceMainContent({
  children,
}: {
  children?: ReactNode;
}) {
  // Route chrome updates re-render AppWorkspaceShell; the route content owns
  // the AppWorkspaceRouteChrome publisher and must not re-render just because
  // the shell read the new chrome.
  return <div className="relative flex h-full min-h-0 flex-col">{children}</div>;
});

function useAppWorkspaceSidebarState() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const { isAuthenticated } = useConvexAuth();
  const localSidebarState = useLocalStorageWorkspaceSidebarState({
    defaults: APP_WORKSPACE_SIDEBAR_DEFAULT_STATE,
    reset: false,
    storageKey: APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
  });
  const isVisualFixtureRoute = pathname === VISUAL_FIXTURE_PATHNAME;
  useLayoutEffect(() => {
    // The localStorage hook above installs the real React state before this
    // layout effect removes the temporary desktop prehydration stylesheet.
    // Mobile prehydration writes root attributes and width variables that React
    // replaces after ResizeObserver reports the viewport size.
    clearAppWorkspaceSidebarDesktopPrehydrationStyle();
  }, []);
  const setLocalSidebarState = localSidebarState.setState;
  const mirrorPersistedSidebarState = useCallback(
    (state: WorkspaceSidebarState) => {
      setLocalSidebarState(() => state, "immediate");
    },
    [setLocalSidebarState],
  );
  const persistedSidebarState = usePersistedWorkspaceSidebarState({
    defaults: localSidebarState.state,
    onPersistedStateApplied:
      !isVisualFixtureRoute && isAuthenticated ? mirrorPersistedSidebarState : null,
    workspaceKey: "app",
  });

  if (!isVisualFixtureRoute && isAuthenticated && persistedSidebarState.isHydrated) {
    return persistedSidebarState;
  }

  return localSidebarState;
}

function AppWorkspaceShellFrame({
  children,
  chrome,
  staticRouteChrome,
}: {
  children?: ReactNode;
  chrome: AppWorkspaceRouteChromeSnapshot | null;
  staticRouteChrome: AppWorkspaceRouteChromeStaticData | null;
}) {
  const sidebarState = useAppWorkspaceSidebarState();
  const appRightSidebarPane = useAppRightSidebarPane();
  const { surface } = useOrganizationContext();
  const headerAccessory = chrome?.headerAccessory;
  const contextLabel =
    surface.kind === "allVaults" || surface.kind === "organization" ? (
      <OrganizationContextLabel />
    ) : null;
  const mainHeader =
    contextLabel === null && headerAccessory === undefined ? undefined : (
      <div className="flex h-full min-w-0 flex-1 items-center">
        {contextLabel}
        {headerAccessory === undefined ? null : (
          <div className="min-w-0 flex-1">{headerAccessory}</div>
        )}
      </div>
    );
  const staticLeftPaneAbsent = staticRouteChrome?.leftPane === "none";
  const mainPane = {
    header: mainHeader,
    content: <AppWorkspaceMainContent>{children}</AppWorkspaceMainContent>,
  } satisfies WorkspaceLayoutV2PaneFrameProps;
  const leftPane = staticLeftPaneAbsent
    ? undefined
    : chrome?.left === null
      ? undefined
      : (chrome?.left ?? {});
  const rightPane = chrome?.right === null ? undefined : (chrome?.right ?? appRightSidebarPane);
  const leftToggleVisibility = staticLeftPaneAbsent
    ? "hidden"
    : (chrome?.leftToggleVisibility ?? "desktop");
  const rightToggleVisibility =
    chrome?.rightToggleVisibility ??
    (surface.kind === "allVaults" || surface.kind === "organization" ? "all" : "desktop");

  return (
    <WorkspacePaneRuntimeProvider
      controller={sidebarState}
      shortcutPaneSide={chrome?.shortcutPaneSide ?? "right"}
    >
      <WorkspaceLayoutV2FullPage
        addressChrome={<RouteUrlEditorNext />}
        dataTestId={
          chrome?.dataTestId ?? staticRouteChrome?.dataTestId ?? APP_WORKSPACE_DATA_TEST_ID
        }
        left={leftPane}
        leftToggleVisibility={leftToggleVisibility}
        main={mainPane}
        mobileMinResizeBehavior={chrome?.mobileMinResizeBehavior}
        right={rightPane}
        rightToggleVisibility={rightToggleVisibility}
      />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: appWorkspaceMobilePanePrehydrationScript }}
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
  const staticRouteChrome = useAppWorkspaceRouteChromeStaticData();

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeContextValue}>
      <OrganizationContextProvider>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <AppWorkspaceShellFrame chrome={chrome} staticRouteChrome={staticRouteChrome}>
            {children}
          </AppWorkspaceShellFrame>
        </div>
      </OrganizationContextProvider>
    </AppWorkspaceRouteChromeContext.Provider>
  );
}

export function AppWorkspaceRouteChrome({
  children,
  dataTestId,
  headerAccessory,
  left,
  leftToggleVisibility,
  mobileMinResizeBehavior,
  right,
  rightToggleVisibility,
  shortcutPaneSide,
}: AppWorkspaceRouteChromeConfig & { children?: ReactNode }) {
  const context = useContext(AppWorkspaceRouteChromeContext);
  const pathname = useLocation({
    select: (location) => location.pathname,
  });
  const idRef = useRef<symbol | null>(null);
  const registeredChromeRef = useRef<AppWorkspaceRouteChromeSnapshot | null>(null);
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
  const chrome = useMemo(
    () => ({
      dataTestId,
      headerAccessory,
      left,
      leftToggleVisibility,
      mobileMinResizeBehavior,
      pathname,
      right,
      rightToggleVisibility,
      shortcutPaneSide,
    }),
    [
      dataTestId,
      headerAccessory,
      left,
      leftToggleVisibility,
      mobileMinResizeBehavior,
      pathname,
      right,
      rightToggleVisibility,
      shortcutPaneSide,
    ],
  );
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;

  useLayoutEffect(() => {
    const registeredChrome = chromeRef.current;
    registeredChromeRef.current = registeredChrome;
    store.register(id, registeredChrome, depth);
    return () => {
      registeredChromeRef.current = null;
      store.unregister(id);
    };
  }, [depth, id, pathname, store]);

  useLayoutEffect(() => {
    if (registeredChromeRef.current === chrome) {
      return;
    }

    registeredChromeRef.current = chrome;
    store.update(id, chrome);
  }, [chrome, id, store]);

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeContextValue}>
      {children}
    </AppWorkspaceRouteChromeContext.Provider>
  );
}
