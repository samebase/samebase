// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import { getFunctionName } from "convex/server";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../../convex/_generated/api";
import { AppRightSidebarContent } from "./AppRightSidebar";

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
}));
const setMobilePane = vi.hoisted(() => vi.fn());
const queryState = vi.hoisted<{
  blockedQueryNames: Set<string>;
  index: number;
  results: unknown[];
  resultsByQueryName: Map<string, unknown>;
  seenQueryNames: string[];
}>(() => ({
  blockedQueryNames: new Set(),
  index: 0,
  results: [],
  resultsByQueryName: new Map(),
  seenQueryNames: [],
}));
const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const FUTURE_JWT = "header.eyJleHAiOjQxMDAwMDAwMDB9.signature";
const PROFILE_JWT = createJwt({
  accountLabelKind: "displayName",
  accountLabel: "Nicu",
  exp: 4100000000,
});
const PROFILE_PROVIDER_JWT = createJwt({
  accountLabelKind: "displayName",
  accountLabel: "Nicu",
  authProvider: "password",
  exp: 4100000000,
});
const PROVIDER_STATUS_QUERY_NAMES = new Set([
  getFunctionName(api.users.getGithubConnectionStatus),
  getFunctionName(api.users.getConvexConnectionStatus),
  getFunctionName(api.users.getCloudflareConnectionStatus),
]);

function createJwt(payload: object) {
  return ["header", Buffer.from(JSON.stringify(payload)).toString("base64url"), "signature"].join(
    ".",
  );
}

function createTestStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.get(String(key)) ?? null;
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null;
    },
    get length() {
      return entries.size;
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
  };
}

function createAsyncHandler() {
  const handler = vi.fn(() => Promise.resolve(undefined));
  const handlerWithOptimisticUpdate = Object.assign(handler, {
    withOptimisticUpdate: () => handlerWithOptimisticUpdate,
  });

  return handlerWithOptimisticUpdate;
}

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useAction: createAsyncHandler,
    useConvexAuth: () => authState,
    useMutation: createAsyncHandler,
    useQuery: (query: Parameters<typeof actual.useQuery>[0], args: unknown) => {
      if (args === "skip") {
        return undefined;
      }

      const queryName = getFunctionName(query);
      queryState.seenQueryNames.push(queryName);
      if (queryState.blockedQueryNames.has(queryName)) {
        throw new Error(`Unexpected provider status query: ${queryName}`);
      }
      if (queryState.resultsByQueryName.has(queryName)) {
        return queryState.resultsByQueryName.get(queryName);
      }

      const result =
        queryState.results.length === 0
          ? undefined
          : queryState.results[queryState.index % queryState.results.length];
      queryState.index += 1;
      return result;
    },
  };
});

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: vi.fn(),
  useAppAuthActions: () => ({
    signOut: vi.fn(),
  }),
  useAppSignInActions: () => ({
    signInWithGoogle: vi.fn(),
    signInWithPassword: vi.fn(),
  }),
}));

vi.mock("@/components/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@/components/workspace-layout-v2/WorkspacePaneRuntime", () => ({
  useWorkspacePaneActions: () => ({ setMobilePane }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    Link: ({
      children,
      className,
      onClick,
      to,
    }: {
      children?: ReactNode;
      className?: string;
      onClick?: () => void;
      to: string;
    }) => (
      <a className={className} href={to} onClick={onClick}>
        {children}
      </a>
    ),
    useLocation: () => ({
      href: "/vault",
      pathname: "/vault",
      searchStr: "",
    }),
    useMatches: ({
      select,
    }: {
      select: (
        matches: Array<{ staticData: { access: "access_public" | "access_dashboard" } }>,
      ) => unknown;
    }) =>
      select([
        { staticData: { access: "access_public" } },
        { staticData: { access: "access_dashboard" } },
      ]),
    useNavigate: () => vi.fn(),
    useRouter: () => ({
      buildLocation: () => ({ href: "/" }),
    }),
  };
});

function prepareRightSidebar(queryResults: unknown[]) {
  queryState.index = 0;
  queryState.results = queryResults;
  queryState.resultsByQueryName = new Map();
  queryState.seenQueryNames = [];
}

function prepareRightSidebarNamed(queryResults: ReadonlyMap<string, unknown>) {
  queryState.index = 0;
  queryState.results = [];
  queryState.resultsByQueryName = new Map(queryResults);
  queryState.seenQueryNames = [];
}

function blockProviderStatusQueries() {
  queryState.blockedQueryNames = new Set(PROVIDER_STATUS_QUERY_NAMES);
}

function expectProviderStatusQueriesNotSeen() {
  for (const queryName of PROVIDER_STATUS_QUERY_NAMES) {
    expect(queryState.seenQueryNames).not.toContain(queryName);
  }
}

function createRightSidebarElement() {
  return (
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <AppRightSidebarContent />
    </AppAuthPresentationProvider>
  );
}

function renderRightSidebar(queryResults: unknown[]) {
  prepareRightSidebar(queryResults);

  return renderToStaticMarkup(createRightSidebarElement());
}

async function renderRightSidebarAfterEffects(queryResults: unknown[]) {
  const mounted = await mountRightSidebarAfterEffects(queryResults);
  const markup = mounted.rootElement.innerHTML;
  await mounted.unmount();
  return markup;
}

async function renderRightSidebarAfterEffectsWithNamedQueries(
  queryResults: ReadonlyMap<string, unknown>,
) {
  prepareRightSidebarNamed(queryResults);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  try {
    await act(async () => {
      root.render(createRightSidebarElement());
    });

    return rootElement.innerHTML;
  } finally {
    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  }
}

async function mountRightSidebarAfterEffects(queryResults: unknown[]) {
  prepareRightSidebar(queryResults);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(createRightSidebarElement());
  });

  return {
    rootElement,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      rootElement.remove();
    },
  };
}

describe("AppRightSidebarContent", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.history.replaceState({}, "", "/vault");
    queryState.index = 0;
    queryState.results = [];
    queryState.resultsByQueryName = new Map();
    queryState.blockedQueryNames = new Set();
    queryState.seenQueryNames = [];
    setMobilePane.mockClear();
  });

  it("does not treat a profileless JWT as temporary auth", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("not logged in");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
    expect(hydratedMarkup).not.toContain("Account");
  });

  it("shows the single signed-out auth surface in the protected-route sidebar", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;

    const markup = renderRightSidebar([]);

    expect(markup).toContain("not logged in");
    expect(markup).toContain("Google");
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("/providers");
    expect(markup).not.toContain(">/vault<");
  });

  it("keeps the prehydration Google placeholder non-interactive", () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    const markup = renderRightSidebar([]);
    const rootElement = document.createElement("div");
    rootElement.innerHTML = markup;
    const googlePlaceholder = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Google",
    );

    if (!(googlePlaceholder instanceof HTMLButtonElement)) {
      throw new Error("Prehydration Google placeholder not found.");
    }

    expect(googlePlaceholder.disabled).toBe(true);
    expect(googlePlaceholder.getAttribute("aria-hidden")).toBe("true");
    expect(googlePlaceholder.tabIndex).toBe(-1);
  });

  it("uses the public signed-out account row after hydration when loading without local auth material", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("not logged in");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("keeps checking login while a refresh token may restore the session", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("uses local JWT profile claims after hydration for the temporary signed-in account row", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(markup).toContain("data-app-auth-prehydration-signed-in");
    expect(markup).toContain("dashboard-sidebar-account-icon");
    expect(markup).toContain("data-app-auth-prehydration-provider");
    expect(markup).toContain("/settings");
    expect(markup).not.toContain("Sign out");
    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).toContain("/settings");
    expect(hydratedMarkup).not.toContain("Sign out");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("renders the temporary signed-in account row without an accordion trigger", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const mounted = await mountRightSidebarAfterEffects([]);
    try {
      expect(mounted.rootElement.textContent).toContain("Nicu");
      expect(mounted.rootElement.textContent).toContain("/settings");
      expect(mounted.rootElement.textContent).not.toContain("Sign out");
      expect(mounted.rootElement.querySelector("[aria-expanded]")).toBeNull();
    } finally {
      await mounted.unmount();
    }
  });

  it("returns the mobile workspace to the main pane when Settings is selected", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const mounted = await mountRightSidebarAfterEffects([]);
    try {
      const settingsLink =
        mounted.rootElement.querySelector<HTMLAnchorElement>('a[href="/settings"]');
      expect(settingsLink).not.toBeNull();
      settingsLink?.click();
      expect(setMobilePane).toHaveBeenCalledWith("main");
    } finally {
      await mounted.unmount();
    }
  });

  it("uses the JWT auth provider while authenticated app access loads", async () => {
    window.localStorage.setItem(
      convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE),
      PROFILE_PROVIDER_JWT,
    );

    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).toContain("Signed in with Password");
    expect(hydratedMarkup).not.toContain("checking login");
  });

  it("keeps local JWT profile claims after hydration while authenticated app access loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);
    const accountIndex = hydratedMarkup.indexOf("Nicu");

    expect(accountIndex).toBeGreaterThanOrEqual(0);
    expect(markup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("/providers");
  });

  it("keeps provider controls hidden while authenticated app access loads", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
    expect(hydratedMarkup).not.toContain("/providers");
    expectProviderStatusQueriesNotSeen();
  });

  it("loads the account row without provider controls for confirmed pending-access users", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_pending_access",
            accessKeys: ["access_public", "access_user_preferences"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_pending-access",
            accountPresentation: {
              kind: "email",
              label: "pending-access@example.com",
            },
          },
        ],
        [
          getFunctionName(api.users.getViewerAuthProviders),
          {
            providers: [],
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain("pending-access@example.com");
    expect(hydratedMarkup).not.toContain("Pending Access User");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("/providers");
    expect(hydratedMarkup).not.toContain("/new-app");
    expectProviderStatusQueriesNotSeen();
  });

  it("shows a non-interactive account state while deletion runs", async () => {
    blockProviderStatusQueries();

    const mounted = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_deleting",
            accessKeys: ["access_public", "access_account_deletion"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_deleting",
            accountPresentation: {
              kind: "email",
              label: "deleting@example.com",
            },
          },
        ],
      ]),
    );

    expect(mounted).toContain("deleting@example.com");
    expect(mounted).toContain("Deleting account");
    expect(mounted).toContain('role="status"');
    expect(mounted).not.toContain("/settings");
    expect(mounted).not.toContain("/providers");
    expectProviderStatusQueriesNotSeen();
  });

  it("renders the account section after the authenticated viewer loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_member",
            accessKeys: ["access_public", "access_provider_connections"],
          },
        ],
        [getFunctionName(api.users.getGithubConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getConvexConnectionStatus), { connected: false }],
        [getFunctionName(api.users.getCloudflareConnectionStatus), { connected: false }],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_123",
            accountPresentation: {
              kind: "email",
              label: "nicu@samebase.md",
            },
          },
        ],
        [getFunctionName(api.users.getViewerAuthProviders), { providers: [] }],
      ]),
    );

    expect(hydratedMarkup).toContain("nicu@samebase.md");
    expect(hydratedMarkup).not.toContain("Nicu");
    expect(hydratedMarkup).toContain('href="/vault"');
    expect(hydratedMarkup.indexOf(">/vault<")).toBeLessThan(hydratedMarkup.indexOf(">/providers<"));
    expect(hydratedMarkup).toContain("/providers");
    expect(hydratedMarkup).toContain("/new-app");
    expect(hydratedMarkup).toContain("/connect-repo");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("not logged in");
    expectProviderStatusQueriesNotSeen();
  });
});
