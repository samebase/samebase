// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppAuthPresentationProvider } from "@/lib/AppAuthPresentationProvider";
import {
  convexAuthJwtStorageKey,
  convexAuthRefreshTokenStorageKey,
} from "@/lib/appAuthPresentationState";
import { readRootRouteSearch, type RootRouteSearch } from "@/routeSearch/root";
import { PublicLandingAccountSection } from "./PublicLandingAccountSection";

const routeState = vi.hoisted<{ pathname: string; search: RootRouteSearch }>(() => ({
  pathname: "/",
  search: {},
}));
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));
const queryState = vi.hoisted<{ index: number; results: unknown[] }>(() => ({
  index: 0,
  results: [],
}));
const setMobilePane = vi.hoisted(() => vi.fn());
const TEST_STORAGE_NAMESPACE = "https://example.convex.cloud";
const PROFILE_JWT = [
  "header",
  Buffer.from(
    JSON.stringify({
      accountLabelKind: "displayName",
      accountLabel: "Nicu",
      exp: 4100000000,
    }),
  ).toString("base64url"),
  "signature",
].join(".");

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

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: () => authState,
    useQuery: (_query: unknown, args: unknown) => {
      if (args === "skip") {
        return undefined;
      }

      const result = queryState.results[queryState.index];
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
  }),
}));

vi.mock("@/components/workspace-layout-v2/WorkspacePaneRuntime", () => ({
  useWorkspacePaneActions: () => ({ setMobilePane }),
}));

vi.mock("@/routeSearch/root", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/routeSearch/root")>();

  return {
    ...actual,
    useRootRouteSearch: () => routeState.search,
  };
});

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
    useLocation: ({
      select,
    }: {
      select: (location: { pathname: string; searchStr: string }) => unknown;
    }) => {
      const search = Object.entries(routeState.search)
        .flatMap(([key, value]) => (value ? [key] : []))
        .join("&");

      return select({
        pathname: routeState.pathname,
        searchStr: search.length > 0 ? `?${search}` : "",
      });
    },
    useNavigate: () => vi.fn(),
    useRouter: () => ({
      buildLocation: () => ({ href: "/" }),
    }),
  };
});

function prepareLandingAccountSection(initialEntry: string) {
  const [pathname, search = ""] = initialEntry.split("?");
  routeState.pathname = pathname || "/";
  routeState.search = readRootRouteSearch(search.length > 0 ? `?${search}` : "");
  queryState.index = 0;
}

function createLandingAccountSectionElement() {
  return (
    <AppAuthPresentationProvider storageNamespace={TEST_STORAGE_NAMESPACE}>
      <PublicLandingAccountSection />
    </AppAuthPresentationProvider>
  );
}

function renderLandingAccountSection(initialEntry: string) {
  prepareLandingAccountSection(initialEntry);

  return renderToStaticMarkup(createLandingAccountSectionElement());
}

async function renderLandingAccountSectionAfterEffects(initialEntry: string) {
  prepareLandingAccountSection(initialEntry);
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  await act(async () => {
    root.render(createLandingAccountSectionElement());
  });

  const markup = rootElement.innerHTML;
  await act(async () => {
    root.unmount();
  });
  rootElement.remove();
  return markup;
}

describe("PublicLandingAccountSection", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    queryState.index = 0;
    queryState.results = [];
    setMobilePane.mockClear();
  });

  it("uses logged-out account presentation after hydration when auth state loads without local auth material", async () => {
    authState.isLoading = true;

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(markup).toContain("data-vault-dashboard-account-section-label");
    expect(markup).not.toContain("dashboard-sidebar-account-row");
    expect(markup).not.toContain("Settings");
    expect(markup).not.toContain("Sign out");
    expect(hydratedMarkup).toContain("not logged in");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("?sign-in");
    expect(hydratedMarkup).not.toContain("?create-account");
  });

  it("uses local JWT profile claims after hydration while auth state loads", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("not logged in");
    expect(queryState.index).toBe(0);
  });

  it("keeps checking login while a refresh token may restore the session", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(
      convexAuthRefreshTokenStorageKey(TEST_STORAGE_NAMESPACE),
      "refresh-token",
    );

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("not logged in");
    expect(queryState.index).toBe(0);
  });

  it("keeps checking login while the signed-in viewer loads without a local profile", async () => {
    authState.isAuthenticated = true;
    queryState.results = [undefined];

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
  });

  it("keeps local JWT profile claims after hydration while the signed-in viewer loads", async () => {
    authState.isAuthenticated = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);
    queryState.results = [undefined];

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
  });

  it("shows the signed-in account name after the viewer loads", async () => {
    authState.isAuthenticated = true;
    queryState.results = [
      {
        _id: "user_123",
        accountPresentation: {
          kind: "displayName",
          label: "Nicu",
        },
      },
      {
        providers: ["google"],
        primaryProvider: "google",
      },
    ];

    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
  });

  it("keeps checking login after an empty signed-in viewer loads", async () => {
    authState.isAuthenticated = true;
    queryState.results = [null];

    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("not logged in");
  });

  it("shows the logged-out account summary collapsed by default", () => {
    const markup = renderLandingAccountSection("/");

    expect(markup).toContain("not logged in");
    expect(markup).not.toContain("?sign-in");
    expect(markup).not.toContain("?create-account");
    expect(markup).not.toContain("Google");
  });

  it("shows Google auth from the sign-in route state", () => {
    const markup = renderLandingAccountSection("/?sign-in");

    expect(markup).toContain("not logged in");
    expect(markup).toContain("Google");
    expect(markup).toContain("?create-account");
    expect(markup).not.toContain("The app is still internal.");
  });

  it("shows Google auth directly on the MCP consent route", () => {
    const markup = renderLandingAccountSection("/oauth/mcp/consent");

    expect(markup).toContain("not logged in");
    expect(markup).toContain("Google");
    expect(markup).not.toContain("?sign-in");
    expect(markup).not.toContain("?create-account");
  });

  it("shows the internal-app message from the create-account route state", () => {
    const markup = renderLandingAccountSection("/?create-account");

    expect(markup).toContain("not logged in");
    expect(markup).toContain("The app is still internal.");
    expect(markup).toContain("?sign-in");
    expect(markup).not.toContain("Google");
  });
});
