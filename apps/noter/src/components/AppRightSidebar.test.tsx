// @vitest-environment jsdom

import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import { AUTH_FLAG_STORAGE_KEY } from "@/lib/authStorageKeys";
import { convexAuthJwtStorageKey } from "@/lib/appAuthPresentationState";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { type ReactNode } from "react";
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
      const result = queryState.results[queryState.index];
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

function renderRightSidebar(queryResults: unknown[]) {
  queryState.index = 0;
  queryState.results = queryResults;

  return renderToStaticMarkup(
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <AppRightSidebarContent />
    </AppAuthPresentationProvider>,
  );
}

describe("AppRightSidebarContent", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    window.localStorage.clear();
    queryState.index = 0;
    queryState.results = [];
  });

  it("shows a signed-in account row during temporary auth without provider controls", () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), FUTURE_JWT);

    const markup = renderRightSidebar([]);

    expect(markup).toContain("Account");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("Providers");
    expect(markup).not.toContain("not logged in");
  });

  it("uses the remembered auth flag for the temporary signed-in account row", () => {
    authState.isAuthenticated = false;
    authState.isLoading = true;
    window.localStorage.setItem(AUTH_FLAG_STORAGE_KEY, "1");

    const markup = renderRightSidebar([]);

    expect(markup).toContain("Account");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("Providers");
  });

  it("keeps the account slot above providers while the authenticated viewer loads", () => {
    const markup = renderRightSidebar([]);
    const checkingLoginIndex = markup.indexOf("checking login");
    const providersIndex = markup.indexOf("Providers");

    expect(checkingLoginIndex).toBeGreaterThanOrEqual(0);
    expect(providersIndex).toBeGreaterThan(checkingLoginIndex);
    expect(markup).not.toContain("not logged in");
  });

  it("renders the account section after the authenticated viewer loads", () => {
    const markup = renderRightSidebar([
      undefined,
      undefined,
      undefined,
      {
        _id: "user_123",
        name: "Nicu",
        email: "nicu@noter.md",
        hasCloudflareConnection: false,
        hasConvexConnection: false,
        hasGithubConnection: false,
      },
      {
        providers: ["password"],
        primaryProvider: "password",
      },
      {
        accountPanelOpen: false,
        providersPanelOpen: false,
      },
    ]);

    expect(markup).toContain("Nicu");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("not logged in");
  });
});
