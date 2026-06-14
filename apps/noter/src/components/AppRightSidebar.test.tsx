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

  return renderToStaticMarkup(<AppRightSidebarContent />);
}

describe("AppRightSidebarContent", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    queryState.index = 0;
    queryState.results = [];
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
