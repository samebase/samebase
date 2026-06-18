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
const PROFILE_JWT =
  "header.eyJleHAiOjQxMDAwMDAwMDAsIm5hbWUiOiJOaWN1IiwiZW1haWwiOiJuaWN1QG5vdGVyLm1kIn0.signature";
const PROVIDER_STATUS_QUERY_NAMES = new Set([
  getFunctionName(api.users.getGithubConnectionStatus),
  getFunctionName(api.users.getConvexConnectionStatus),
  getFunctionName(api.users.getCloudflareConnectionStatus),
]);

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
  useNoterAuthActions: () => ({
    signOut: vi.fn(),
  }),
}));

vi.mock("@/components/ApiKeyConnectDialog", () => ({
  useApiKeyConnectDialog: () => ({
    apiKeyDialog: null,
    openApiKeyDialog: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();

  return {
    ...actual,
    Link: ({
      children,
      className,
      to,
    }: {
      children?: ReactNode;
      className?: string;
      to: string;
    }) => (
      <a className={className} href={to}>
        {children}
      </a>
    ),
    useLocation: () => ({
      href: "/home",
      pathname: "/home",
      searchStr: "",
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

function findButtonByText(rootElement: HTMLElement, text: string) {
  for (const button of rootElement.querySelectorAll("button")) {
    if (button.textContent.includes(text)) {
      return button;
    }
  }

  return null;
}

describe("AppRightSidebarContent", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    window.history.replaceState({}, "", "/home");
    queryState.index = 0;
    queryState.results = [];
    queryState.resultsByQueryName = new Map();
    queryState.blockedQueryNames = new Set();
    queryState.seenQueryNames = [];
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
    expect(hydratedMarkup).not.toContain("Providers");
    expect(hydratedMarkup).not.toContain("Account");
  });

  it("shows the public signed-out account row without provider controls", () => {
    authState.isAuthenticated = false;
    authState.isLoading = false;

    const markup = renderRightSidebar([]);

    expect(markup).toContain("not logged in");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("Providers");
  });

  it("uses the public signed-out account row after hydration when loading without local auth material", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("not logged in");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Providers");
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
    expect(hydratedMarkup).not.toContain("Providers");
  });

  it("uses local JWT profile claims after hydration for the temporary signed-in account row", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Providers");
  });

  it("allows the temporary signed-in account row to open", async () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const mounted = await mountRightSidebarAfterEffects([]);
    try {
      const accountButton = findButtonByText(mounted.rootElement, "Nicu");
      if (accountButton === null) {
        throw new Error("Missing temporary signed-in account button.");
      }

      expect(accountButton.getAttribute("aria-expanded")).toBe("false");

      await act(async () => {
        accountButton.click();
      });

      expect(accountButton.getAttribute("aria-expanded")).toBe("true");
    } finally {
      await mounted.unmount();
    }
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
    expect(hydratedMarkup).not.toContain("Providers");
  });

  it("keeps provider controls hidden while authenticated app access loads", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffects([]);

    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
    expect(hydratedMarkup).not.toContain("Providers");
    expectProviderStatusQueriesNotSeen();
  });

  it("loads the account row without provider controls for confirmed waitlisted users", async () => {
    blockProviderStatusQueries();

    const hydratedMarkup = await renderRightSidebarAfterEffectsWithNamedQueries(
      new Map([
        [
          getFunctionName(api.users.currentViewerAccess),
          {
            role: "role_waitlisted",
            accessKeys: ["access_public", "access_user_preferences"],
          },
        ],
        [
          getFunctionName(api.users.viewer),
          {
            _id: "user_waitlisted",
            name: "Waitlisted User",
            email: "waitlisted@example.com",
            hasCloudflareConnection: false,
            hasConvexConnection: false,
            hasGithubConnection: false,
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

    expect(hydratedMarkup).toContain("Waitlisted User");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Providers");
    expect(hydratedMarkup).not.toContain("New App");
    expectProviderStatusQueriesNotSeen();
  });

  it("renders the account section after the authenticated viewer loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

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
            name: "Nicu",
            email: "nicu@noter.md",
            hasCloudflareConnection: false,
            hasConvexConnection: false,
            hasGithubConnection: false,
          },
        ],
        [getFunctionName(api.users.getViewerAuthProviders), { providers: [] }],
        [
          getFunctionName(api.dashboardSettings.getDashboardSettings),
          {
            accountPanelOpen: false,
            providersPanelOpen: false,
          },
        ],
      ]),
    );

    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("not logged in");
  });
});
