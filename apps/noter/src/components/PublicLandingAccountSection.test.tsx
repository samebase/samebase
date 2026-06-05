import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { readRootRouteSearch, type RootRouteSearch } from "@/lib/rootRouteSearch";
import { type ReactNode } from "react";
import { PublicLandingAccountSection } from "./PublicLandingAccountSection";

const routeState = vi.hoisted<{ pathname: string; search: RootRouteSearch }>(() => ({
  pathname: "/",
  search: {},
}));
const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}));

vi.mock("convex/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("convex/react")>();

  return {
    ...actual,
    useConvexAuth: () => authState,
    useQuery: () => undefined,
  };
});

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: vi.fn(),
  useNoterAuthActions: () => ({
    signOut: vi.fn(),
  }),
  useNoterSignInActions: () => ({
    signInWithGoogle: vi.fn(),
  }),
}));

vi.mock("@/lib/rootRouteSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rootRouteSearch")>();

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

function renderLandingAccountSection(initialEntry: string) {
  const [pathname, search = ""] = initialEntry.split("?");
  routeState.pathname = pathname || "/";
  routeState.search = readRootRouteSearch(search.length > 0 ? `?${search}` : "");

  return renderToStaticMarkup(<PublicLandingAccountSection />);
}

describe("PublicLandingAccountSection", () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
  });

  it("shows the checking login summary while auth state loads", () => {
    authState.isLoading = true;

    const markup = renderLandingAccountSection("/");

    expect(markup).toContain("checking login");
    expect(markup).toContain("animate-spin");
    expect(markup).not.toContain("not logged in");
    expect(markup).not.toContain("?sign-in");
    expect(markup).not.toContain("?create-account");
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

  it("shows the internal-app message from the create-account route state", () => {
    const markup = renderLandingAccountSection("/?create-account");

    expect(markup).toContain("not logged in");
    expect(markup).toContain("The app is still internal.");
    expect(markup).toContain("?sign-in");
    expect(markup).not.toContain("Google");
  });
});
