// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppRightSidebarContent } from "./AppRightSidebar";

const authState = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
}));
const queryState = vi.hoisted<{ index: number; results: unknown[] }>(() => ({
  index: 0,
  results: [],
}));
const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const FUTURE_JWT = "header.eyJleHAiOjQxMDAwMDAwMDB9.signature";
const PROFILE_JWT =
  "header.eyJleHAiOjQxMDAwMDAwMDAsIm5hbWUiOiJOaWN1IiwiZW1haWwiOiJuaWN1QG5vdGVyLm1kIn0.signature";

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
    useQuery: () => {
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
  prepareRightSidebar(queryResults);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(createRightSidebarElement());
  });

  const markup = rootElement.innerHTML;
  await act(async () => {
    root.unmount();
  });
  rootElement.remove();
  return markup;
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

  it("keeps local JWT profile claims after hydration while the authenticated viewer loads", async () => {
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderRightSidebar([]);
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);
    const accountIndex = hydratedMarkup.indexOf("Nicu");
    const providersIndex = hydratedMarkup.indexOf("Providers");

    expect(accountIndex).toBeGreaterThanOrEqual(0);
    expect(providersIndex).toBeGreaterThan(accountIndex);
    expect(markup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
  });

  it("keeps a checking-login account slot above providers while the authenticated viewer loads", async () => {
    const hydratedMarkup = await renderRightSidebarAfterEffects([]);
    const accountIndex = hydratedMarkup.indexOf("checking login");
    const providersIndex = hydratedMarkup.indexOf("Providers");

    expect(accountIndex).toBeGreaterThanOrEqual(0);
    expect(providersIndex).toBeGreaterThan(accountIndex);
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
  });

  it("renders the account section after the authenticated viewer loads", async () => {
    const loadedQueryResults = [
      {
        _id: "user_123",
        name: "Nicu",
        email: "nicu@noter.md",
        hasCloudflareConnection: false,
        hasConvexConnection: false,
        hasGithubConnection: false,
      },
    ];
    const hydratedMarkup = await renderRightSidebarAfterEffects(loadedQueryResults);

    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("not logged in");
  });
});
