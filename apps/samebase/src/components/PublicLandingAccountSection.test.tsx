// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readRootRouteSearch, type RootRouteSearch } from "@/routeSearch/root";
import { rootQueries } from "@/routes/root.queries";
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
const viewerState = vi.hoisted<{ viewer: unknown }>(() => ({ viewer: undefined }));
const buildLocationMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());
const signInWithOAuthMock = vi.hoisted(() => vi.fn());
const rejectionState = vi.hoisted<{ message: string | null }>(() => ({ message: null }));
vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: () => authState,
  };
});

// The section reads the root loader's viewer; the other root queries have no data here.
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[1] === rootQueries.viewer.queryKey[1] ? viewerState.viewer : undefined,
  }),
}));

// A prerendered page: its render knows no session token, so the provider's loading state decides.
vi.mock("@/components/NotSignedIn", () => ({
  NotSignedIn: ({ children }: { children: ReactNode }) =>
    authState.isLoading || !authState.isAuthenticated ? children : null,
}));

// This jsdom mount has no Start server request or client compilation.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => window.location.origin,
}));

vi.mock("@/lib/oauthSignInRejection", () => ({
  useOAuthSignInRejection: () => rejectionState.message,
}));

vi.mock("@/authClient", () => ({
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
}

function createLandingAccountSectionElement() {
  return <PublicLandingAccountSection />;
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
    viewerState.viewer = undefined;
    buildLocationMock.mockReset();
    buildLocationMock.mockReturnValue({ href: "/" });
    navigateMock.mockReset();
    rejectionState.message = null;
    signInWithOAuthMock.mockReset();
    signInWithOAuthMock.mockResolvedValue(undefined);
  });

  it("shows the sign-in while a prerendered page waits for the session", async () => {
    authState.isLoading = true;

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("Sign in or create an account");
    expect(markup).not.toContain("checking login");
    expect(markup).not.toContain("dashboard-sidebar-account-row");
    expect(markup).not.toContain("/settings");
    expect(markup).not.toContain("Sign out");
    expect(hydratedMarkup).toContain("Sign in or create an account");
    expect(hydratedMarkup).not.toContain("checking login");
  });

  it("keeps checking login while the signed-in viewer loads", async () => {
    authState.isAuthenticated = true;

    const markup = renderLandingAccountSection("/");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(markup).toContain("checking login");
    expect(hydratedMarkup).toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
  });

  it("shows the signed-in account name after the viewer loads", async () => {
    authState.isAuthenticated = true;
    const viewer = {
      _id: "user_123",
      accountPresentation: {
        kind: "displayName",
        label: "Nicu",
      },
    };
    viewerState.viewer = viewer;

    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/");

    expect(hydratedMarkup).toContain("Nicu");
    expect(hydratedMarkup).not.toContain("checking login");
    expect(hydratedMarkup).not.toContain("Account");
    expect(hydratedMarkup).not.toContain("Sign in or create an account");
  });

  it("keeps checking login after an empty signed-in viewer loads", async () => {
    authState.isAuthenticated = true;
    viewerState.viewer = null;

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

  it("keeps checking login while a public OAuth return redeems its sign-in code", async () => {
    authState.isLoading = true;

    const markup = renderLandingAccountSection("/?signup=github");
    const hydratedMarkup = await renderLandingAccountSectionAfterEffects("/?signup=github");

    for (const rendered of [markup, hydratedMarkup]) {
      expect(rendered).toContain("checking login");
      expect(rendered).not.toContain("Sign-in was not completed.");
      expect(rendered).not.toContain("Continue with GitHub");
    }
  });

  it("shows the incomplete sign-in notice after a public Google OAuth return", () => {
    const markup = renderLandingAccountSection("/?signup=google");
    const renderedDocument = new DOMParser().parseFromString(markup, "text/html");

    expect(renderedDocument.body.textContent).toContain("Sign in or create an account");
    expect(renderedDocument.body.textContent).toContain("Sign-in was not completed.");
    expect(renderedDocument.querySelector('a[href="/"]')?.textContent).toBe("Try again");
    expect(renderedDocument.querySelectorAll("button")).toHaveLength(0);
    expect(renderedDocument.querySelectorAll("input")).toHaveLength(0);
  });

  it("shows why Samebase rejected the sign-in and keeps GitHub sign-in available", async () => {
    rejectionState.message =
      "This Samebase account already uses a different GitHub account. Sign in with that account.";

    const markup = await renderLandingAccountSectionAfterEffects("/?signup=github");

    expect(markup).toContain(
      "This Samebase account already uses a different GitHub account. Sign in with that account.",
    );
    expect(markup).toContain("Continue with GitHub");
    expect(markup).not.toContain("Continue with Google");
    expect(markup).not.toContain("Sign-in was not completed.");
  });
});
