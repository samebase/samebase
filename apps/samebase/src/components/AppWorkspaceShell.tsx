import {
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocation, useMatches } from "@tanstack/react-router";
import { useAppRightSidebarPane } from "@/components/useAppRightSidebarPane";
import { OrganizationContextProvider } from "@/organization/OrganizationContext";
import { useOrganizationContext } from "@/organization/context";
import { RouteUrlEditorNext } from "@/components/RouteUrlEditor/RouteUrlEditorNext";
import { AppSidebarLayout } from "@/components/AppSidebarLayout";
import {
  SidebarRuntimeProvider,
  type SidebarSide,
  useSidebarActions,
} from "@samebase/sidebars/SidebarRuntime";
import { type SidebarLayoutMobileMinResizeBehavior } from "@samebase/sidebars/SidebarLayoutGeometry";
import { type PaneFrameProps } from "@samebase/sidebars/PaneFrame";
import type {
  SidebarLayoutState,
  SidebarLayoutStateController,
} from "@samebase/sidebars/SidebarLayoutState";
import { useLocalWorkspaceSidebarState } from "@/hooks/useLocalWorkspaceSidebarState";
import { DocumentRenderedWithSessionContext } from "@/lib/documentSession";
import { usePersistedWorkspaceSidebarState } from "@/hooks/usePersistedWorkspaceSidebarState";
import { useVisualFixtureWorkspaceSidebarState } from "@/hooks/useVisualFixtureWorkspaceSidebarState";
import {
  APP_WORKSPACE_LEFT_SIDEBAR_DEFAULT_WIDTH_PX,
  APP_WORKSPACE_RIGHT_SIDEBAR_DEFAULT_WIDTH_PX,
} from "@/lib/appWorkspaceSidebarPreferences";
import prehydrateAppWorkspaceSidebarSource from "@/lib/appWorkspaceSidebarPrehydrationScript?inline-script";
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

const VISUAL_FIXTURE_PATHNAME = "/visual-fixture";
const APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCRIPT = `(${prehydrateAppWorkspaceSidebarSource})();`;

/**
 * A first visit starts with the left sidebar closed. The right sidebar starts open because it holds
 * sign-in for protected routes and invite links. A saved state takes over after a toggle.
 */
const APP_WORKSPACE_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: false,
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

/**
The route chrome of the rendered leaf route. It reads the rendered matches, not the location, so a
navigation changes the panes in the same render as the route content, after the new route's loader
has its data.
*/
function useAppWorkspaceRouteChromeStaticData() {
  return useMatches({
    select: (matches) => matches.at(-1)?.staticData.appWorkspaceRouteChrome ?? null,
  });
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

type AppWorkspaceShellFrameProps = {
  children?: ReactNode;
  chrome: AppWorkspaceRouteChromeSnapshot | null;
  staticRouteChrome: AppWorkspaceRouteChromeStaticData | null;
};

function PersistedAppWorkspaceShellFrame(props: AppWorkspaceShellFrameProps) {
  const sidebarState = usePersistedWorkspaceSidebarState(APP_WORKSPACE_SIDEBAR_DEFAULT_STATE);

  return <AppWorkspaceShellFrame {...props} sidebarState={sidebarState} />;
}

/**
A page that renders without a session (a prerendered public page, or a server render for a visitor
without one) keeps its sidebar state in local storage. The inline script after the layout shows the
stored state before the first paint; a page rendered as the user never renders it.
*/
function LocalAppWorkspaceShellFrame(props: AppWorkspaceShellFrameProps) {
  const sidebarState = useLocalWorkspaceSidebarState(APP_WORKSPACE_SIDEBAR_DEFAULT_STATE);

  return (
    <>
      <AppWorkspaceShellFrame {...props} sidebarState={sidebarState} />
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: APP_WORKSPACE_SIDEBAR_PREHYDRATION_SCRIPT }}
      />
    </>
  );
}

function VisualFixtureAppWorkspaceShellFrame(props: AppWorkspaceShellFrameProps) {
  const sidebarState = useVisualFixtureWorkspaceSidebarState(APP_WORKSPACE_SIDEBAR_DEFAULT_STATE);

  return <AppWorkspaceShellFrame {...props} sidebarState={sidebarState} />;
}

function AppWorkspaceShellFrame({
  children,
  chrome,
  sidebarState,
  staticRouteChrome,
}: AppWorkspaceShellFrameProps & { sidebarState: SidebarLayoutStateController }) {
  const appRightSidebarPane = useAppRightSidebarPane();
  const { surface } = useOrganizationContext();
  const headerAccessory = chrome?.headerAccessory;
  const mainHeader =
    headerAccessory === undefined ? undefined : (
      <div className="flex h-full min-w-0 flex-1 items-center">
        <div className="min-w-0 flex-1">{headerAccessory}</div>
      </div>
    );
  const staticLeftPane = staticRouteChrome?.leftPane;
  const mainPane = {
    header: mainHeader,
    content: <AppWorkspaceMainContent>{children}</AppWorkspaceMainContent>,
  } satisfies PaneFrameProps;
  const leftPane =
    staticLeftPane === "none"
      ? undefined
      : (staticLeftPane ?? (chrome?.left === null ? undefined : (chrome?.left ?? {})));
  const rightPane = chrome?.right === null ? undefined : (chrome?.right ?? appRightSidebarPane);
  const leftToggleVisibility =
    staticLeftPane === "none" ? "hidden" : (chrome?.leftToggleVisibility ?? "desktop");
  const rightToggleVisibility =
    chrome?.rightToggleVisibility ??
    (surface.kind === "allRepositories" || surface.kind === "organization" ? "all" : "desktop");

  return (
    <SidebarRuntimeProvider controller={sidebarState}>
      <AppWorkspacePaneShortcut side={chrome?.shortcutPaneSide ?? "right"} />
      <AppSidebarLayout
        addressChrome={<RouteUrlEditorNext />}
        left={leftPane}
        leftToggleVisibility={leftToggleVisibility}
        main={mainPane}
        mobileMinResizeBehavior={chrome?.mobileMinResizeBehavior}
        right={rightPane}
        rightToggleVisibility={rightToggleVisibility}
      />
    </SidebarRuntimeProvider>
  );
}

export function AppWorkspaceShell({ children }: { children?: ReactNode }) {
  const routePathname = useLocation({ select: (location) => location.pathname });
  const renderedWithSession = useContext(DocumentRenderedWithSessionContext);

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
  const ShellFrame =
    routePathname === VISUAL_FIXTURE_PATHNAME
      ? VisualFixtureAppWorkspaceShellFrame
      : renderedWithSession
        ? PersistedAppWorkspaceShellFrame
        : LocalAppWorkspaceShellFrame;

  return (
    <AppWorkspaceRouteChromeContext.Provider value={chromeContextValue}>
      <OrganizationContextProvider>
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
          <ShellFrame chrome={chrome} staticRouteChrome={staticRouteChrome}>
            {children}
          </ShellFrame>
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
