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

const routeState = vi.hoisted<{
  access: "access_public" | "access_user_preferences";
  pathname: string;
  search: RootRouteSearch;
}>(() => ({
  access: "access_public",
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
const buildLocationMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const signInWithOAuthMock = vi.hoisted(() => vi.fn());
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
    signInWithOAuth: signInWithOAuthMock,
  }),
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
        .flatMap(([key, value]) =>
          value === true
            ? [key]
            : typeof value === "string"
              ? [`${key}=${encodeURIComponent(value)}`]
              : [],
        )
        .join("&");

      return select({
        pathname: routeState.pathname,
        searchStr: search.length > 0 ? `?${search}` : "",
      });
    },
    useMatches: ({
      select,
    }: {
      select: (matches: Array<{ staticData: { access: typeof routeState.access } }>) => unknown;
    }) =>
      select([
        { staticData: { access: "access_public" } },
        { staticData: { access: routeState.access } },
      ]),
    useNavigate: () => navigateMock,
    useRouter: () => ({
      buildLocation: buildLocationMock,
      navigate: navigateMock,
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
    routeState.access = "access_public";
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createTestStorage(),
    });
    queryState.index = 0;
    queryState.results = [];
    buildLocationMock.mockReset();
    buildLocationMock.mockReturnValue({ href: "/" });
    navigateMock.mockReset();
    signInWithOAuthMock.mockReset();
  });

  it("uses logged-out account presentation after hydration when auth state loads without local auth material", async () => {
    authState.isLoading = true;

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(markup).toContain("data-repository-dashboard-account-section-label");
    expect(markup).not.toContain("dashboard-sidebar-account-row");
    expect(markup).not.toContain("/settings");
    expect(markup).not.toContain("Sign out");
    expect(hydratedMarkup).toContain("Sign in or create an account");
    expect(hydratedMarkup).toContain("Continue with GitHub");
    expect(hydratedMarkup).not.toContain("Continue with Google");
    expect(hydratedMarkup).not.toContain("checking login");
  });

  it("uses local JWT profile claims after hydration while auth state loads", async () => {
    authState.isLoading = true;
    window.localStorage.setItem(convexAuthJwtStorageKey(TEST_STORAGE_NAMESPACE), PROFILE_JWT);

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("Sign out");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
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
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
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
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
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
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
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
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
  });

  it("keeps checking login after an empty signed-in viewer loads", async () => {
    authState.isAuthenticated = true;
    queryState.results = [null];

    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
  });

  it("shows only GitHub OAuth in a static logged-out account section", () => {
    const markup = renderLandingAccountSection("/");

    expect(markup).toContain("Sign in or create an account");
    expect(markup).toContain("Continue with GitHub");
    expect(markup).not.toContain("Continue with Google");
    expect(markup).not.toContain("lucide-chevron-down");
    expect(markup).not.toContain("The app is still internal.");
  });

  it("keeps protected-route login in the account sidebar", async () => {
    routeState.access = "access_user_preferences";
    prepareLandingAccountSection("/settings");
    buildLocationMock.mockImplementation(
      (options: { search: (currentSearch: RootRouteSearch) => RootRouteSearch; to: string }) => {
        expect(options.to).toBe(".");
        expect(options.search({})).toEqual({
          auth: undefined,
          "auth-return": undefined,
          signup: "github",
        });
        return { href: "/settings?signup=github" };
      },
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(createLandingAccountSectionElement());
    });

    const githubButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Continue with GitHub",
    );
    if (!(githubButton instanceof HTMLButtonElement)) {
      throw new Error("GitHub sign-in button not found.");
    }

    await act(async () => {
      githubButton.click();
    });

    expect(buildLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ".",
      }),
    );
    expect(signInWithOAuthMock).toHaveBeenCalledWith("github", "/settings?signup=github");

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });

  it("keeps the MCP consent route when GitHub auth starts", async () => {
    prepareLandingAccountSection("/oauth/mcp/consent?signup=github");
    buildLocationMock.mockImplementation(
      (options: { search: (currentSearch: RootRouteSearch) => RootRouteSearch; to: string }) => {
        expect(options.to).toBe(".");
        expect(options.search({ signup: "github" })).toEqual({
          auth: undefined,
          "auth-return": undefined,
          signup: undefined,
        });
        return { href: "/oauth/mcp/consent" };
      },
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(createLandingAccountSectionElement());
    });

    const githubButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Continue with GitHub",
    );
    if (!(githubButton instanceof HTMLButtonElement)) {
      throw new Error("GitHub sign-in button not found.");
    }

    await act(async () => {
      githubButton.click();
    });

    expect(buildLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ".",
      }),
    );
    expect(signInWithOAuthMock).toHaveBeenCalledWith("github", "/oauth/mcp/consent");

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });

  it("keeps an invitation route when GitHub auth starts", async () => {
    prepareLandingAccountSection("/invite/invitation-code?signup=github");
    buildLocationMock.mockImplementation(
      (options: { search: (currentSearch: RootRouteSearch) => RootRouteSearch; to: string }) => {
        expect(options.to).toBe(".");
        expect(options.search({ signup: "github" })).toEqual({
          auth: undefined,
          "auth-return": undefined,
          signup: undefined,
        });
        return { href: "/invite/invitation-code" };
      },
    );
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const root = createRoot(rootElement);

    await act(async () => {
      root.render(createLandingAccountSectionElement());
    });

    const githubButton = Array.from(rootElement.querySelectorAll("button")).find(
      (button) => button.textContent.trim() === "Continue with GitHub",
    );
    if (!(githubButton instanceof HTMLButtonElement)) {
      throw new Error("GitHub sign-in button not found.");
    }

    await act(async () => {
      githubButton.click();
    });

    expect(signInWithOAuthMock).toHaveBeenCalledWith("github", "/invite/invitation-code");

    await act(async () => {
      root.unmount();
    });
    rootElement.remove();
  });

  it("shows the internal-app message after a failed public Google signup return", () => {
    const markup = renderLandingAccountSection("/?signup=google");

    expect(markup).toContain("Sign in or create an account");
    expect(markup).toContain("The app is still internal.");
    expect(markup).not.toContain("Google");
  });

  it("shows the internal-app message after a failed protected-route Google signup return", () => {
    routeState.access = "access_user_preferences";

    const markup = renderLandingAccountSection("/settings?signup=google");

    expect(markup).toContain("Sign in or create an account");
    expect(markup).toContain("The app is still internal.");
    expect(markup).not.toContain("Google");
  });

  it("explains how to link GitHub and keeps GitHub sign-in available", async () => {
    const markup = await renderLandingAccountSectionAfterEffects(
      "/?signup=github&authorization-provider=github-sign-in&authorization-error=account-link-required",
    );

    expect(markup).toContain(
      "The primary email on this GitHub account is already used by another Samebase account. Sign in to that account with an existing method, then connect GitHub in Account settings.",
    );
    expect(markup).toContain("Continue with GitHub");
    expect(markup).not.toContain("Continue with Google");
    expect(markup).not.toContain("The app is still internal.");
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        replace: true,
        to: ".",
      }),
    );
  });
});
