import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvexAuth } from "convex/react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useAppRightSidebarPane } from "@/components/useAppRightSidebarPane";
import { OrganizationContextProvider } from "@/components/OrganizationContext";
import { useOrganizationContext } from "@/lib/organizationContext";
import { RouteUrlEditorNext } from "@/components/RouteUrlEditor/RouteUrlEditorNext";
import { AppSidebarLayout } from "@/components/AppSidebarLayout";
import {
  SidebarRuntimeProvider,
  type SidebarSide,
  useSidebarActions,
} from "@samebase/sidebars/SidebarRuntime";
import { type SidebarLayoutMobileMinResizeBehavior } from "@samebase/sidebars/SidebarLayoutGeometry";
import { type PaneFrameProps } from "@samebase/sidebars/PaneFrame";
import type { SidebarLayoutState } from "@samebase/sidebars/SidebarLayoutState";
import { useLocalStorageWorkspaceSidebarState } from "@/hooks/useLocalStorageWorkspaceSidebarState";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
import {
  appWorkspaceMobilePanePrehydrationScript,
  appWorkspaceSidebarPrehydrationScript,
  clearAppWorkspaceSidebarDesktopPrehydrationStyle,
} from "@/lib/appWorkspaceSidebarPrehydration";
import {
  APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
  APP_WORKSPACE_SIDEBAR_STORAGE_KEY,
} from "@/lib/appWorkspaceSidebarPreferences";
import type { AppWorkspaceRouteChromeStaticData } from "@/routing/permissions";

type AppWorkspaceShellToggleVisibility = "all" | "desktop" | "hidden";
type AppWorkspaceRouteChromePane = PaneFrameProps | null;

type AppWorkspaceRouteChromeConfig = {
  headerAccessory?: ReactNode;
  left?: AppWorkspaceRouteChromePane;
  leftToggleVisibility?: AppWorkspaceShellToggleVisibility;
  mobileMinResizeBehavior?: SidebarLayoutMobileMinResizeBehavior;
  right?: AppWorkspaceRouteChromePane;
  rightToggleVisibility?: AppWorkspaceShellToggleVisibility;
  shortcutPaneSide?: SidebarSide;
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
} satisfies SidebarLayoutState;

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

function useAppWorkspaceRouteChromeStaticData(pathname: string) {
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

function isAppWorkspacePaneShortcutEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false;
  }

  return (
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], .monaco-editor, .cm-editor',
    ) !== null
  );
}

function AppWorkspacePaneShortcut({ side }: { side: SidebarSide }) {
  const { toggleLeftPane, toggleRightPane } = useSidebarActions();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "b" ||
        (!event.metaKey && !event.ctrlKey) ||
        isAppWorkspacePaneShortcutEditableTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      if (side === "right") {
        toggleRightPane();
        return;
      }
      toggleLeftPane();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [side, toggleLeftPane, toggleRightPane]);

  return null;
}

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
    (state: SidebarLayoutState) => {
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
  routeAddressOverride,
  staticRouteChrome,
}: {
  children?: ReactNode;
  chrome: AppWorkspaceRouteChromeSnapshot | null;
  routeAddressOverride?: string;
  staticRouteChrome: AppWorkspaceRouteChromeStaticData | null;
}) {
  const sidebarState = useAppWorkspaceSidebarState();
  const appRightSidebarPane = useAppRightSidebarPane();
  const { surface } = useOrganizationContext();
  const headerAccessory = chrome?.headerAccessory;
  const mainHeader =
    headerAccessory === undefined ? undefined : (
      <div className="flex h-full min-w-0 flex-1 items-center">
        <div className="min-w-0 flex-1">{headerAccessory}</div>
      </div>
    );
  const staticLeftPaneAbsent = staticRouteChrome?.leftPane === "none";
  const mainPane = {
    header: mainHeader,
    content: <AppWorkspaceMainContent>{children}</AppWorkspaceMainContent>,
  } satisfies PaneFrameProps;
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
    (surface.kind === "allRepositories" || surface.kind === "organization" ? "all" : "desktop");

  return (
    <SidebarRuntimeProvider controller={sidebarState}>
      <AppWorkspacePaneShortcut side={chrome?.shortcutPaneSide ?? "right"} />
      <AppSidebarLayout
        addressChrome={<RouteUrlEditorNext routeAddressOverride={routeAddressOverride} />}
        left={leftPane}
        leftToggleVisibility={leftToggleVisibility}
        main={mainPane}
        mobileMinResizeBehavior={chrome?.mobileMinResizeBehavior}
        right={rightPane}
        rightToggleVisibility={rightToggleVisibility}
      />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: appWorkspaceSidebarPrehydrationScript }}
      />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: appWorkspaceMobilePanePrehydrationScript }}
      />
    </SidebarRuntimeProvider>
  );
}

/**
Cloudflare can serve the `/`-based `index.html` for another route. TanStack marks the build render
with `isShell()` and the browser fallback render with `ssr === false` or `globalNotFound`. Keep both
renders on `/`. The effect enables the requested route after hydration.
*/
function useAppWorkspaceSpaShellFirstRender() {
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return (
    !hasHydrated &&
    (router.isShell() ||
      router.state.matches.some((match) => match.ssr === false || match.globalNotFound))
  );
}

export function AppWorkspaceShell({ children }: { children?: ReactNode }) {
  const routePathname = useLocation({ select: (location) => location.pathname });
  const isSpaShellFirstRender = useAppWorkspaceSpaShellFirstRender();
  const workspacePathname = isSpaShellFirstRender ? "/" : routePathname;

  const chromeStore = useMemo(createAppWorkspaceRouteChromeStore, []);
  const chromeContextValue = useMemo(
    () => ({
      depth: 0,
      store: chromeStore,
    }),
    [chromeStore],
  );
  const chrome = useAppWorkspaceRouteChrome(chromeStore);
  const staticRouteChrome = useAppWorkspaceRouteChromeStaticData(workspacePathname);

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeContextValue}>
      <OrganizationContextProvider pathnameOverride={workspacePathname}>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <AppWorkspaceShellFrame
            chrome={chrome}
            routeAddressOverride={isSpaShellFirstRender ? "/" : undefined}
            staticRouteChrome={staticRouteChrome}
          >
            {isSpaShellFirstRender ? null : children}
          </AppWorkspaceShellFrame>
        </div>
      </OrganizationContextProvider>
    </AppWorkspaceRouteChromeContext.Provider>
  );
}

export function AppWorkspaceRouteChrome({
  children,
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
